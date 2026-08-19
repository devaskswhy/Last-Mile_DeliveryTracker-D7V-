import type {
  OrderType,
  PaymentType,
  RateScope,
  SurchargeMode,
} from "@/lib/domain/enums";

/**
 * The engine's data contract.
 *
 * Every monetary and weight value crosses this boundary as a **decimal string**
 * — the form `Prisma.Decimal.toString()` produces, and the form the API returns.
 * Strings keep the value exact end to end; a `number` in any of these positions
 * would be a rounding bug waiting for a large enough order.
 */

// ---------------------------------------------------------------------------
// Configuration snapshot (what the engine reads instead of a database)
// ---------------------------------------------------------------------------

export interface ConfigZone {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ConfigArea {
  id: string;
  name: string;
  /** Already normalised (upper case, no spaces or hyphens). */
  pincode: string;
  isActive: boolean;
  zone: ConfigZone;
}

export interface ConfigRateCard {
  id: string;
  orderType: OrderType;
  scope: RateScope;
  fromZoneId: string;
  toZoneId: string;
  /** Flat charge covering the first `baseWeightKg`. */
  baseRate: string;
  baseWeightKg: string;
  /** Charge per kilogram, or part thereof, beyond `baseWeightKg`. */
  perKgRate: string;
  isActive: boolean;
}

export interface ConfigCodSurcharge {
  id: string;
  orderType: OrderType;
  mode: SurchargeMode;
  amount: string | null;
  percentage: string | null;
  minAmount: string | null;
  isActive: boolean;
}

/**
 * The slice of configuration a quote needs.
 *
 * `areas` need only contain candidates for the two pincodes being quoted — the
 * loader narrows the query rather than shipping the whole table — but it must
 * contain *all* areas for those pincodes, so the engine can detect a pincode
 * that ambiguously spans two zones instead of silently taking the first row.
 */
export interface RateConfig {
  areas: readonly ConfigArea[];
  rateCards: readonly ConfigRateCard[];
  codSurcharges: readonly ConfigCodSurcharge[];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface Dimensions {
  lengthCm: string | number;
  breadthCm: string | number;
  heightCm: string | number;
}

export interface RateQuoteInput {
  pickupPincode: string;
  dropPincode: string;
  dimensionsCm: Dimensions;
  actualWeightKg: string | number;
  orderType: OrderType;
  paymentType: PaymentType;
  /**
   * Divisor converting cm³ to a billable weight. Defaults to
   * `DEFAULT_VOLUMETRIC_DIVISOR`, which mirrors the `Order.volumetricDivisor`
   * column default so a quote and the order it becomes agree.
   */
  volumetricDivisor?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface ZoneSummary {
  id: string;
  code: string;
  name: string;
  /** The area the pincode resolved through — shown so the customer can verify. */
  resolvedArea: { id: string; name: string; pincode: string };
}

export interface RateCardSummary {
  id: string;
  orderType: OrderType;
  scope: RateScope;
  fromZoneId: string;
  toZoneId: string;
  baseRate: string;
  baseWeightKg: string;
  perKgRate: string;
}

/** How the freight charge was built, itemised for display. */
export interface FreightBreakdown {
  /** Flat component covering the first `baseWeightKg`. */
  baseRate: string;
  baseWeightKg: string;
  /** Chargeable weight above the base slab, before rounding up. */
  excessWeightKg: string;
  /** Whole kilograms actually billed — `ceil(excessWeightKg)`. */
  billedExcessKg: number;
  perKgRate: string;
  /** `perKgRate × billedExcessKg`. */
  excessCharge: string;
}

/** How the COD surcharge was derived. Null when the order is prepaid. */
export type CodBreakdown =
  | {
      mode: "FIXED";
      amount: string;
    }
  | {
      mode: "PERCENTAGE";
      percentage: string;
      /** The percentage applied to freight, before any floor. */
      computed: string;
      minAmount: string | null;
      /** True when `minAmount` exceeded the computed value and was used. */
      floorApplied: boolean;
    };

export interface RateQuote {
  pickupZone: ZoneSummary;
  dropZone: ZoneSummary;
  actualWeight: string;
  volumetricWeight: string;
  chargeableWeight: string;
  scope: RateScope;
  rateCardUsed: RateCardSummary;
  baseCharge: string;
  codSurcharge: string;
  totalCharge: string;

  // --- Context for an itemised quote -------------------------------------
  orderType: OrderType;
  paymentType: PaymentType;
  volumetricDivisor: number;
  /** Which of actual/volumetric weight set the chargeable weight. */
  chargeableWeightBasis: "ACTUAL" | "VOLUMETRIC";
  freightBreakdown: FreightBreakdown;
  codBreakdown: CodBreakdown | null;
}
