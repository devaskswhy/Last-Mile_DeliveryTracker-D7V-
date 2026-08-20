import type { OrderStatus } from "./enums";

/**
 * The order state machine.
 *
 * ```
 * CREATED → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
 *                                       ↓              ↓
 *                                    FAILED ←──────────┘
 *                                       ↓
 *                        reschedule → ASSIGNED (agent found)
 *                                   → CREATED  (none available)
 * ```
 *
 * `ASSIGNED` sits between `CREATED` and `PICKED_UP` because an agent may only
 * act on work that is theirs — there is no one entitled to pick up an order
 * that has not been assigned to anybody.
 *
 * `FAILED` is reachable only from `IN_TRANSIT` and `OUT_FOR_DELIVERY`: a parcel
 * has to be out for delivery before delivery can fail.
 */

/** Statuses that mean an agent still owes work — what workload balancing counts. */
export const ACTIVE_ORDER_STATUSES = [
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

/**
 * Statuses after which an order is closed for good.
 *
 * `FAILED` is deliberately **not** here, though an earlier version of this file
 * had it. A failed delivery is not the end of an order — it is the point at
 * which the customer picks a new date and the order re-enters the pipeline. If
 * `FAILED` counted as closed, `assignOrder` would refuse the reassignment that
 * rescheduling depends on.
 */
export const CLOSED_ORDER_STATUSES = [
  "DELIVERED",
  "CANCELLED",
] as const satisfies readonly OrderStatus[];

/** Every transition the domain permits, regardless of who is asking. */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  CREATED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  // Reached only through the reschedule flow, which assigns an agent (or
  // leaves the order unassigned when none is free).
  FAILED: ["ASSIGNED", "CREATED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * The subset an agent may drive from the field.
 *
 * Narrower than `ALLOWED_TRANSITIONS` on purpose. An agent moves work forward
 * and reports a failure; they do not cancel orders, do not move an order
 * backwards, and do not reschedule — that is the customer's decision to make.
 */
export const AGENT_TRANSITIONS: Readonly<
  Partial<Record<OrderStatus, readonly OrderStatus[]>>
> = {
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
};

export function isActiveStatus(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);
}

/** True when the order is finished and accepts no further transition. */
export function isClosedStatus(status: OrderStatus): boolean {
  return (CLOSED_ORDER_STATUSES as readonly string[]).includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function agentCanTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return (AGENT_TRANSITIONS[from] ?? []).includes(to);
}

/** What an agent may do next from here — drives the buttons in the agent UI. */
export function agentNextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return AGENT_TRANSITIONS[from] ?? [];
}
