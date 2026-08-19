import type {
  OrderType as PrismaOrderType,
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

// Compile-time parity with the Prisma enums.
const _orderTypeParity = ORDER_TYPES satisfies readonly PrismaOrderType[];
const _rateScopeParity = RATE_SCOPES satisfies readonly PrismaRateScope[];
const _surchargeModeParity =
  SURCHARGE_MODES satisfies readonly PrismaSurchargeMode[];
void _orderTypeParity;
void _rateScopeParity;
void _surchargeModeParity;

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
