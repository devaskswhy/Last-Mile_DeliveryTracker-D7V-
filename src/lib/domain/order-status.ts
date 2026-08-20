import type { OrderStatus } from "./enums";

/**
 * Which statuses mean an agent still owes work on an order.
 *
 * This is the definition auto-assignment balances on, so it matters that it is
 * stated once. `CREATED` is deliberately excluded — an order with no agent is
 * nobody's workload — and the three terminal statuses are excluded because the
 * work is finished one way or another.
 */
export const ACTIVE_ORDER_STATUSES = [
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

/** Statuses after which an order is closed and must not be reassigned. */
export const TERMINAL_ORDER_STATUSES = [
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const satisfies readonly OrderStatus[];

export function isActiveStatus(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}
