import type { Role } from "@/lib/auth/roles";
import type { OrderStatus } from "@/lib/domain/enums";
import { agentNextStatuses, isClosedStatus } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";

/**
 * The customer-facing timeline.
 *
 * Every history row in order, oldest first — the whole trail, not a summary.
 * The rows are the audit record, so the endpoint reads them as they are rather
 * than reconstructing a story from the order's current fields.
 */

export interface TimelineEntry {
  id: string;
  status: OrderStatus;
  fromStatus: OrderStatus | null;
  note: string | null;
  at: string;
  actor: { name: string; role: Role } | null;
}

export interface AttemptSummary {
  attemptNumber: number;
  status: string;
  scheduledFor: string | null;
  failureReason: string | null;
  failedAt: string | null;
  deliveredAt: string | null;
  agent: { name: string; employeeCode: string } | null;
}

export interface OrderTracking {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  isClosed: boolean;
  /** True when the customer may book a new delivery date. */
  canReschedule: boolean;
  createdAt: string;
  deliveredAt: string | null;
  route: {
    pickup: { city: string; pincode: string; zone: string };
    drop: { city: string; pincode: string; zone: string };
  };
  assignedAgent: { name: string; employeeCode: string } | null;
  totalCharge: string;
  attempts: AttemptSummary[];
  timeline: TimelineEntry[];
}

export class TrackingAccessError extends Error {
  constructor(readonly status: 403 | 404, message: string) {
    super(message);
    this.name = "TrackingAccessError";
    Object.setPrototypeOf(this, TrackingAccessError.prototype);
  }
}

/**
 * Builds the timeline for one order, enforcing who may see it: the customer who
 * owns it, the agent it is assigned to, or an admin.
 */
export async function getOrderTracking(
  orderId: string,
  viewer: { id: string; role: Role },
): Promise<OrderTracking> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      customerId: true,
      totalCharge: true,
      pickupCity: true,
      pickupPincode: true,
      dropCity: true,
      dropPincode: true,
      pickupZone: { select: { code: true } },
      dropZone: { select: { code: true } },
      assignedAgent: {
        select: {
          employeeCode: true,
          userId: true,
          user: { select: { name: true } },
        },
      },
      attempts: {
        orderBy: { attemptNumber: "asc" },
        select: {
          attemptNumber: true,
          status: true,
          scheduledFor: true,
          failureReason: true,
          failedAt: true,
          deliveredAt: true,
          agent: {
            select: { employeeCode: true, user: { select: { name: true } } },
          },
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          fromStatus: true,
          note: true,
          createdAt: true,
          actorRole: true,
          actor: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    throw new TrackingAccessError(404, "Order not found");
  }

  const isOwner = order.customerId === viewer.id;
  const isAssignedAgent = order.assignedAgent?.userId === viewer.id;
  if (viewer.role !== "ADMIN" && !isOwner && !isAssignedAgent) {
    throw new TrackingAccessError(403, "You do not have access to this order");
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currentStatus: order.status,
    isClosed: isClosedStatus(order.status),
    // Only the owning customer is offered the reschedule action; an agent
    // viewing the same order should not be able to pick the date.
    canReschedule: order.status === "FAILED" && (isOwner || viewer.role === "ADMIN"),
    createdAt: order.createdAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    route: {
      pickup: {
        city: order.pickupCity,
        pincode: order.pickupPincode,
        zone: order.pickupZone.code,
      },
      drop: {
        city: order.dropCity,
        pincode: order.dropPincode,
        zone: order.dropZone.code,
      },
    },
    assignedAgent: order.assignedAgent
      ? {
          name: order.assignedAgent.user.name,
          employeeCode: order.assignedAgent.employeeCode,
        }
      : null,
    totalCharge: order.totalCharge.toString(),
    attempts: order.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      scheduledFor: attempt.scheduledFor?.toISOString() ?? null,
      failureReason: attempt.failureReason,
      failedAt: attempt.failedAt?.toISOString() ?? null,
      deliveredAt: attempt.deliveredAt?.toISOString() ?? null,
      agent: attempt.agent
        ? { name: attempt.agent.user.name, employeeCode: attempt.agent.employeeCode }
        : null,
    })),
    timeline: order.statusHistory.map((entry) => ({
      id: entry.id,
      status: entry.status,
      fromStatus: entry.fromStatus,
      note: entry.note,
      at: entry.createdAt.toISOString(),
      actor: entry.actor
        ? { name: entry.actor.name, role: entry.actorRole }
        : null,
    })),
  };
}

/** What the agent UI should offer as buttons for this order. */
export function nextActionsFor(status: OrderStatus): readonly OrderStatus[] {
  return agentNextStatuses(status);
}
