import type { Role } from "@/lib/auth/roles";
import type { OrderStatus } from "@/lib/domain/enums";
import {
  agentCanTransition,
  agentNextStatuses,
  canTransition,
  isClosedStatus,
} from "@/lib/domain/order-status";
import { notify, wasDelivered } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { appendStatusHistory } from "./history";

export type StatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "NOT_YOUR_ORDER"
  | "ORDER_CLOSED"
  | "INVALID_TRANSITION"
  | "SAME_STATUS"
  | "REASON_REQUIRED";

export class StatusError extends Error {
  readonly code: StatusErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: StatusErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StatusError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, StatusError.prototype);
  }
}

export interface StatusChangeRequest {
  status: OrderStatus;
  /** Agent's note, or the admin's reason for an override. */
  note?: string | null;
  /**
   * Admin override. Bypasses the state machine — an admin correcting a
   * mis-clicked status needs to move an order somewhere the normal flow does
   * not allow. It is still recorded, with the actor and their reason.
   */
  override?: boolean;
}

export interface StatusChangeResult {
  orderId: string;
  orderNumber: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  nextStatuses: readonly OrderStatus[];
  notified: boolean;
}

/**
 * Moves an order to a new status, appends the audit entry, and notifies the
 * customer.
 *
 * Role rules are enforced here rather than in the route so every caller gets
 * them: an agent may only move an order assigned to them, and only along the
 * transitions `AGENT_TRANSITIONS` permits. An admin may override to any status,
 * but must say why.
 */
export async function updateOrderStatus(
  orderId: string,
  request: StatusChangeRequest,
  actor: { id: string; role: Role },
): Promise<StatusChangeResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        assignedAgentId: true,
        assignedAgent: {
          select: {
            userId: true,
            employeeCode: true,
            user: { select: { name: true } },
          },
        },
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new StatusError("ORDER_NOT_FOUND", "Order not found", { orderId });
    }

    const isOverride = request.override === true && actor.role === "ADMIN";

    // --- Who may act -----------------------------------------------------
    if (actor.role === "AGENT") {
      if (order.assignedAgent?.userId !== actor.id) {
        // Same message and status whether or not the order exists elsewhere,
        // so an agent cannot probe for other agents' order ids.
        throw new StatusError(
          "NOT_YOUR_ORDER",
          "This order is not assigned to you",
          { orderId },
        );
      }
    } else if (actor.role === "CUSTOMER") {
      throw new StatusError(
        "NOT_YOUR_ORDER",
        "Customers cannot change an order's status",
        { orderId },
      );
    }

    if (request.status === order.status) {
      throw new StatusError(
        "SAME_STATUS",
        `Order ${order.orderNumber} is already ${order.status}`,
        { orderId, status: order.status },
      );
    }

    // --- Whether the move is legal ---------------------------------------
    if (isOverride) {
      if (!request.note || request.note.trim() === "") {
        throw new StatusError(
          "REASON_REQUIRED",
          "An override needs a reason — it is what the audit trail is for",
        );
      }
    } else {
      if (isClosedStatus(order.status)) {
        throw new StatusError(
          "ORDER_CLOSED",
          `Order ${order.orderNumber} is ${order.status} and cannot change further`,
          { orderId, status: order.status },
        );
      }

      const permitted =
        actor.role === "AGENT"
          ? agentCanTransition(order.status, request.status)
          : canTransition(order.status, request.status);

      if (!permitted) {
        throw new StatusError(
          "INVALID_TRANSITION",
          `An order cannot go from ${order.status} to ${request.status}`,
          {
            orderId,
            from: order.status,
            to: request.status,
            allowed:
              actor.role === "AGENT"
                ? agentNextStatuses(order.status)
                : undefined,
          },
        );
      }
    }

    // --- Apply -------------------------------------------------------------
    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: request.status,
        deliveredAt: request.status === "DELIVERED" ? now : undefined,
      },
    });

    // A failed delivery closes the current attempt, so the reschedule flow
    // knows which attempt to supersede and why it ended.
    if (request.status === "FAILED") {
      const current = await tx.deliveryAttempt.findFirst({
        where: { orderId: order.id, status: "SCHEDULED" },
        orderBy: { attemptNumber: "desc" },
      });
      if (current) {
        await tx.deliveryAttempt.update({
          where: { id: current.id },
          data: {
            status: "FAILED",
            failureReason: request.note ?? null,
            failedAt: now,
            agentId: order.assignedAgentId,
          },
        });
      }
    }

    if (request.status === "DELIVERED") {
      const current = await tx.deliveryAttempt.findFirst({
        where: { orderId: order.id, status: "SCHEDULED" },
        orderBy: { attemptNumber: "desc" },
      });
      if (current) {
        await tx.deliveryAttempt.update({
          where: { id: current.id },
          data: {
            status: "DELIVERED",
            deliveredAt: now,
            agentId: order.assignedAgentId,
          },
        });
      }
    }

    const prefix = isOverride ? "Status overridden by admin" : "Status updated";
    await appendStatusHistory(tx, {
      orderId: order.id,
      status: request.status,
      fromStatus: order.status,
      actorId: actor.id,
      actorRole: actor.role,
      note: request.note ? `${prefix}: ${request.note}` : prefix,
    });

    return {
      order,
      previousStatus: order.status,
      occurredAt: now,
      isOverride,
    };
  });

  // --- Notify, outside the transaction ------------------------------------
  // The change is committed by this point. A notification failure must not
  // roll it back, or an agent would retry a transition that already happened.
  const result = await notify(
    {
      id: outcome.order.id,
      orderNumber: outcome.order.orderNumber,
      status: request.status,
      customer: outcome.order.customer,
      agent: outcome.order.assignedAgent
        ? {
            name: outcome.order.assignedAgent.user.name,
            employeeCode: outcome.order.assignedAgent.employeeCode,
          }
        : null,
    },
    request.status === "FAILED"
      ? { type: "DELIVERY_FAILED", reason: request.note ?? null }
      : { type: "STATUS_CHANGED", from: outcome.previousStatus },
  );

  return {
    orderId: outcome.order.id,
    orderNumber: outcome.order.orderNumber,
    previousStatus: outcome.previousStatus,
    status: request.status,
    nextStatuses: agentNextStatuses(request.status),
    notified: wasDelivered(result),
  };
}
