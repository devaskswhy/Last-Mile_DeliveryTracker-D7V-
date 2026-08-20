import type { Role } from "@/lib/auth/roles";
import { isClosedStatus } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";

import { ASSIGNMENT_STRATEGY, chooseAgentForZone } from "./assignment";
import { appendStatusHistory } from "./history";

export type AssignErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_TERMINAL"
  | "AGENT_NOT_FOUND"
  | "AGENT_INACTIVE"
  | "ALREADY_ASSIGNED"
  | "NO_AGENT_AVAILABLE";

export class AssignError extends Error {
  readonly code: AssignErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AssignErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AssignError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AssignError.prototype);
  }
}

export type AssignRequest =
  | { mode: "MANUAL"; agentId: string }
  | { mode: "AUTO" };

export interface AssignResult {
  orderId: string;
  orderNumber: string;
  status: string;
  agent: { id: string; name: string; employeeCode: string };
  previousAgent: { id: string; name: string; employeeCode: string } | null;
  mode: "MANUAL" | "AUTO";
}

/**
 * Assigns or reassigns an order, by admin choice or by running the
 * auto-assignment policy on demand.
 *
 * Manual assignment deliberately ignores availability and zone. That is the
 * point of an override: a dispatcher looking at a real situation knows things
 * the policy does not, and a manual route that only permitted what the
 * automatic route would already have chosen would be useless. The one thing it
 * will not do is assign work to a deactivated account.
 *
 * The order row is updated, but the audit trail is only ever appended to.
 */
export async function assignOrder(
  orderId: string,
  request: AssignRequest,
  actor: { id: string; role: Role },
): Promise<AssignResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        pickupZoneId: true,
        assignedAgentId: true,
        assignedAt: true,
        assignedAgent: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new AssignError("ORDER_NOT_FOUND", "Order not found", { orderId });
    }

    // A delivered, cancelled or failed order is closed. Reassigning one would
    // record a handover of work that no longer exists.
    if (isClosedStatus(order.status)) {
      throw new AssignError(
        "ORDER_TERMINAL",
        `Order ${order.orderNumber} is ${order.status} and cannot be reassigned`,
        { orderId, status: order.status },
      );
    }

    // --- Choose the agent -------------------------------------------------
    let agentId: string;

    if (request.mode === "MANUAL") {
      agentId = request.agentId;
    } else {
      const selection = await chooseAgentForZone(tx, order.pickupZoneId);
      if (selection.selected === null) {
        throw new AssignError("NO_AGENT_AVAILABLE", selection.reason, {
          orderId,
          consideredCount: selection.consideredCount,
        });
      }
      agentId = selection.selected.agentId;
    }

    const agent = await tx.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        employeeCode: true,
        availability: true,
        user: { select: { name: true, isActive: true } },
      },
    });

    if (!agent) {
      throw new AssignError("AGENT_NOT_FOUND", "That agent does not exist", {
        agentId,
      });
    }
    if (!agent.user.isActive) {
      throw new AssignError(
        "AGENT_INACTIVE",
        `${agent.user.name}'s account is deactivated and cannot take orders`,
        { agentId },
      );
    }

    // Refused rather than treated as success, so the audit trail never gains a
    // row describing a handover that did not happen.
    if (order.assignedAgentId === agent.id) {
      throw new AssignError(
        "ALREADY_ASSIGNED",
        `Order ${order.orderNumber} is already assigned to ${agent.user.name}`,
        { orderId, agentId },
      );
    }

    // --- Apply ------------------------------------------------------------
    // Reassignment does not rewind the workflow. An order already picked up
    // stays picked up; only an unassigned one advances to ASSIGNED. That keeps
    // each history row's `status` equal to the order's status at that moment,
    // so the trail reads as a status log rather than a mix of two things.
    const nextStatus = order.status === "CREATED" ? "ASSIGNED" : order.status;
    const now = new Date();

    await tx.order.update({
      where: { id: order.id },
      data: {
        assignedAgentId: agent.id,
        status: nextStatus,
        assignedAt: order.assignedAt ?? now,
      },
    });

    const previous = order.assignedAgent;
    const how =
      request.mode === "AUTO"
        ? `auto-assignment, strategy ${ASSIGNMENT_STRATEGY}`
        : "manual assignment by admin";

    const note = previous
      ? `Reassigned from ${previous.user.name} (${previous.employeeCode}) to ${agent.user.name} (${agent.employeeCode}) — ${how}`
      : `Assigned to ${agent.user.name} (${agent.employeeCode}) — ${how}`;

    await appendStatusHistory(tx, {
      orderId: order.id,
      status: nextStatus,
      fromStatus: order.status,
      actorId: actor.id,
      actorRole: actor.role,
      note,
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: nextStatus,
      agent: {
        id: agent.id,
        name: agent.user.name,
        employeeCode: agent.employeeCode,
      },
      previousAgent: previous
        ? {
            id: previous.id,
            name: previous.user.name,
            employeeCode: previous.employeeCode,
          }
        : null,
      mode: request.mode,
    };
  });
}
