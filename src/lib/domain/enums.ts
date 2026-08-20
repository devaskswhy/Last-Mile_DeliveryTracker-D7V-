import type {
  AgentAvailability as PrismaAgentAvailability,
  OrderStatus as PrismaOrderStatus,
  OrderType as PrismaOrderType,
  PaymentType as PrismaPaymentType,
  RateScope as PrismaRateScope,
  SurchargeMode as PrismaSurchargeMode,
} from "@prisma/client";

/**
 * Plain-data mirrors of the Prisma enums, for building form controls and
 * iterating over every possible value.
 *
 * These are *structural* — they describe the shape of the domain, not its
 * configuration. Zones, rates and surcharge values are business configuration
 * and must always be read from the database; none of them may appear here or
 * anywhere else in application code.
 *
 * The `satisfies` guards below fail the build if a list drifts from its enum.
 */

export const ORDER_TYPES = ["B2B", "B2C"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const RATE_SCOPES = ["INTRA", "INTER"] as const;
export type RateScope = (typeof RATE_SCOPES)[number];

export const SURCHARGE_MODES = ["FIXED", "PERCENTAGE"] as const;
export type SurchargeMode = (typeof SURCHARGE_MODES)[number];

export const PAYMENT_TYPES = ["PREPAID", "COD"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const ORDER_STATUSES = [
  "CREATED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const AGENT_AVAILABILITIES = ["AVAILABLE", "BUSY", "OFFLINE"] as const;
export type AgentAvailability = (typeof AGENT_AVAILABILITIES)[number];

// Compile-time parity with the Prisma enums.
const _orderTypeParity = ORDER_TYPES satisfies readonly PrismaOrderType[];
const _rateScopeParity = RATE_SCOPES satisfies readonly PrismaRateScope[];
const _surchargeModeParity =
  SURCHARGE_MODES satisfies readonly PrismaSurchargeMode[];
const _paymentTypeParity = PAYMENT_TYPES satisfies readonly PrismaPaymentType[];
const _orderStatusParity = ORDER_STATUSES satisfies readonly PrismaOrderStatus[];
const _availabilityParity =
  AGENT_AVAILABILITIES satisfies readonly PrismaAgentAvailability[];
void _orderTypeParity;
void _rateScopeParity;
void _surchargeModeParity;
void _paymentTypeParity;
void _orderStatusParity;
void _availabilityParity;

/**
 * Scope is *derived*, never chosen. A rate card whose stored scope disagreed
 * with its zone pair could never be matched by a lookup — the lookup computes
 * the scope the same way, from the pickup and drop zones. Deriving it here (and
 * enforcing it with a CHECK constraint in the database) makes that class of
 * broken row impossible rather than merely discouraged.
 */
export function deriveScope(fromZoneId: string, toZoneId: string): RateScope {
  return fromZoneId === toZoneId ? "INTRA" : "INTER";
}
