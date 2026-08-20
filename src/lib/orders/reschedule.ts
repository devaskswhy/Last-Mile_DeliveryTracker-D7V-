import type { Role } from "@/lib/auth/roles";
import type { OrderStatus } from "@/lib/domain/enums";
import { notifySafely } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { ASSIGNMENT_STRATEGY, chooseAgentForZone } from "./assignment";
import { appendStatusHistory } from "./history";

export type RescheduleErrorCode =
  | "ORDER_NOT_FOUND"
  | "NOT_YOUR_ORDER"
  | "NOT_FAILED"
  | "DATE_IN_PAST";

export class RescheduleError extends Error {
  readonly code: RescheduleErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RescheduleErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RescheduleError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, RescheduleError.prototype);
  }
}

export interface RescheduleResult {
  orderId: string;
  orderNumber: string;
  attemptNumber: number;
  scheduledFor: Date;
  status: string;
  assignment:
    | { assigned: true; agentName: string; employeeCode: string }
    | { assigned: false; reason: string };
}

/**
 * Books a new delivery attempt after a failure.
 *
 * Only the customer who owns the order (or an admin acting for them) may
 * reschedule — the new date is the customer's decision, not the agent's.
 *
 * Auto-assignment is re-run rather than reusing the previous agent. The
 * original agent may now be off shift, out of the zone, or simply busier than
 * a colleague, and the attempt that already failed is not evidence they should
 * get the next one. If nobody is free the order goes back to `CREATED`
 * unassigned, exactly as it would at creation, and an admin can retry.
 */
export async function rescheduleDelivery(
  orderId: string,
  scheduledFor: Date,
  actor: { id: string; role: Role },
  note?: string | null,
): Promise<RescheduleResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerId: true,
        pickupZoneId: true,
        assignedAgentId: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) {
      throw new RescheduleError("ORDER_NOT_FOUND", "Order not found", { orderId });
    }

    if (actor.role !== "ADMIN" && order.customerId !== actor.id) {
      throw new RescheduleError(
        "NOT_YOUR_ORDER",
        "You can only reschedule your own orders",
        { orderId },
      );
    }

    // Rescheduling is the answer to a failure, so there has to be one.
    if (order.status !== "FAILED") {
      throw new RescheduleError(
        "NOT_FAILED",
        `Order ${order.orderNumber} is ${order.status}; only a failed delivery can be rescheduled`,
        { orderId, status: order.status },
      );
    }

    if (scheduledFor.getTime() <= Date.now()) {
      throw new RescheduleError(
        "DATE_IN_PAST",
        "Pick a delivery date in the future",
        { scheduledFor: scheduledFor.toISOString() },
      );
    }

    // --- Open the next attempt -------------------------------------------
    const latest = await tx.deliveryAttempt.findFirst({
      where: { orderId: order.id },
      orderBy: { attemptNumber: "desc" },
      select: { attemptNumber: true },
    });
    const attemptNumber = (latest?.attemptNumber ?? 0) + 1;

    // --- Re-run auto-assignment ------------------------------------------
    const selection = await chooseAgentForZone(tx, order.pickupZoneId);
    const agent = selection.selected;
    const nextStatus: OrderStatus = agent ? "ASSIGNED" : "CREATED";
    const now = new Date();

    await tx.deliveryAttempt.create({
      data: {
        orderId: order.id,
        attemptNumber,
        status: "SCHEDULED",
        scheduledFor,
        agentId: agent?.agentId ?? null,
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        assignedAgentId: agent?.agentId ?? null,
        assignedAt: agent ? now : null,
      },
    });

    // Two history rows, because two things happened: the customer booked a new
    // date, and the order was assigned. Collapsing them would lose which actor
    // was responsible for which.
    await appendStatusHistory(tx, {
      orderId: order.id,
      status: nextStatus,
      fromStatus: "FAILED",
      actorId: actor.id,
      actorRole: actor.role,
      note:
        `Delivery rescheduled for ${scheduledFor.toISOString()} (attempt ${attemptNumber})` +
        (note ? ` — ${note}` : ""),
    });

    if (agent) {
      await appendStatusHistory(tx, {
        orderId: order.id,
        status: nextStatus,
        fromStatus: nextStatus,
        actorId: actor.id,
        actorRole: actor.role,
        note: `Auto-assigned to ${agent.agentName} (${agent.employeeCode}) for attempt ${attemptNumber} — strategy ${ASSIGNMENT_STRATEGY}, ${agent.activeOrderCount} active order(s) at selection`,
      });
    }

    return { order, attemptNumber, nextStatus, agent, selection, now };
  });

  await notifySafely({
    type: "DELIVERY_RESCHEDULED",
    recipient: {
      userId: outcome.order.customer.id,
      name: outcome.order.customer.name,
      email: outcome.order.customer.email,
    },
    orderId: outcome.order.id,
    orderNumber: outcome.order.orderNumber,
    status: outcome.nextStatus,
    previousStatus: "FAILED",
    message: note ?? null,
    scheduledFor,
    attemptNumber: outcome.attemptNumber,
    occurredAt: outcome.now,
  });

  return {
    orderId: outcome.order.id,
    orderNumber: outcome.order.orderNumber,
    attemptNumber: outcome.attemptNumber,
    scheduledFor,
    status: outcome.nextStatus,
    assignment: outcome.agent
      ? {
          assigned: true,
          agentName: outcome.agent.agentName,
          employeeCode: outcome.agent.employeeCode,
        }
      : {
          assigned: false,
          reason:
            outcome.selection.selected === null
              ? outcome.selection.reason
              : "No agent available",
        },
  };
}
