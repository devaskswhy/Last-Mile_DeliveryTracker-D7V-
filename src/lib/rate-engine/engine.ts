import { deriveScope } from "@/lib/domain/enums";

import {
  DIMENSION_SCALE,
  DecimalParseError,
  MONEY_SCALE,
  WEIGHT_SCALE,
  ceilDivide,
  divideRoundHalf,
  formatFixed,
  max,
  parseFixed,
} from "./decimal";
import { RateEngineError } from "./errors";
import type {
  CodBreakdown,
  ConfigArea,
  ConfigCodSurcharge,
  ConfigRateCard,
  RateConfig,
  RateQuote,
  RateQuoteInput,
  ZoneSummary,
} from "./types";

/**
 * Mirrors the `Order.volumetricDivisor` column default, so a quote and the
 * order created from it agree on the arithmetic. Overridable per call.
 */
export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;

/**
 * Normalises a pincode the same way `src/lib/validation/area.ts` does before
 * storing one. If these two ever disagree, every address whose pincode was
 * entered with a space silently stops resolving, so the rule lives in one
 * shape and is applied on both sides of the comparison.
 */
export function normalizePincode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Prices a shipment. Pure and synchronous: it reads only its arguments, so the
 * same inputs always give the same output and the whole thing is testable
 * without a database.
 *
 * Throws `RateEngineError` when no price can be produced. It never falls back
 * to a default — a quote that silently under-charges is worse than one that
 * refuses.
 */
export function calculateRate(
  input: RateQuoteInput,
  config: RateConfig,
): RateQuote {
  const divisor = input.volumetricDivisor ?? DEFAULT_VOLUMETRIC_DIVISOR;
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new RateEngineError(
      "INVALID_MEASUREMENT",
      "Volumetric divisor must be a positive whole number",
      { volumetricDivisor: divisor },
    );
  }

  // --- 1. Zone detection -------------------------------------------------
  const pickup = resolveZone(input.pickupPincode, config.areas, "PICKUP");
  const drop = resolveZone(input.dropPincode, config.areas, "DROP");

  // --- 2/3. Weights ------------------------------------------------------
  const actualGrams = readMeasurement(
    input.actualWeightKg,
    WEIGHT_SCALE,
    "Actual weight",
  );
  const volumetricGrams = volumetricWeightGrams(input, divisor);
  const chargeableGrams = max(actualGrams, volumetricGrams);

  // --- 4. Scope and rate card -------------------------------------------
  const scope = deriveScope(pickup.zone.id, drop.zone.id);
  const card = findRateCard(
    config.rateCards,
    input.orderType,
    scope,
    pickup.zone.id,
    drop.zone.id,
    pickup.zone.code,
    drop.zone.code,
  );

  const baseRate = parseFixed(card.baseRate, MONEY_SCALE, "Base rate");
  const baseWeightGrams = parseFixed(
    card.baseWeightKg,
    WEIGHT_SCALE,
    "Base weight",
  );
  const perKgRate = parseFixed(card.perKgRate, MONEY_SCALE, "Per-kg rate");

  // Weight above the included slab, billed per whole kilogram "or part
  // thereof". Both operands are integers, so the boundary cases land exactly:
  // a chargeable weight equal to the base slab bills zero extra kilos, and one
  // exactly a kilo above it bills one, not two.
  const excessGrams = max(0n, chargeableGrams - baseWeightGrams);
  const billedExcessKg = ceilDivide(excessGrams, 1000n);
  const excessCharge = perKgRate * billedExcessKg;
  const freight = baseRate + excessCharge;

  // --- 5. COD surcharge --------------------------------------------------
  const { surcharge, breakdown } = codSurchargeFor(input, config, freight);

  const total = freight + surcharge;

  return {
    pickupZone: pickup.summary,
    dropZone: drop.summary,
    actualWeight: formatFixed(actualGrams, WEIGHT_SCALE),
    volumetricWeight: formatFixed(volumetricGrams, WEIGHT_SCALE),
    chargeableWeight: formatFixed(chargeableGrams, WEIGHT_SCALE),
    scope,
    rateCardUsed: {
      id: card.id,
      orderType: card.orderType,
      scope: card.scope,
      fromZoneId: card.fromZoneId,
      toZoneId: card.toZoneId,
      baseRate: card.baseRate,
      baseWeightKg: card.baseWeightKg,
      perKgRate: card.perKgRate,
    },
    baseCharge: formatFixed(freight, MONEY_SCALE),
    codSurcharge: formatFixed(surcharge, MONEY_SCALE),
    totalCharge: formatFixed(total, MONEY_SCALE),

    orderType: input.orderType,
    paymentType: input.paymentType,
    volumetricDivisor: divisor,
    chargeableWeightBasis:
      volumetricGrams > actualGrams ? "VOLUMETRIC" : "ACTUAL",
    freightBreakdown: {
      baseRate: formatFixed(baseRate, MONEY_SCALE),
      baseWeightKg: formatFixed(baseWeightGrams, WEIGHT_SCALE),
      excessWeightKg: formatFixed(excessGrams, WEIGHT_SCALE),
      billedExcessKg: Number(billedExcessKg),
      perKgRate: formatFixed(perKgRate, MONEY_SCALE),
      excessCharge: formatFixed(excessCharge, MONEY_SCALE),
    },
    codBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Zone detection
// ---------------------------------------------------------------------------

function resolveZone(
  pincode: string,
  areas: readonly ConfigArea[],
  side: "PICKUP" | "DROP",
): { zone: ConfigArea["zone"]; summary: ZoneSummary } {
  const normalized = normalizePincode(pincode);

  if (normalized === "") {
    throw new RateEngineError(
      side === "PICKUP" ? "PICKUP_AREA_NOT_FOUND" : "DROP_AREA_NOT_FOUND",
      `A ${side.toLowerCase()} pincode is required`,
      { pincode },
    );
  }

  const matches = areas.filter(
    (area) => area.isActive && area.pincode === normalized,
  );

  if (matches.length === 0) {
    throw new RateEngineError(
      side === "PICKUP" ? "PICKUP_AREA_NOT_FOUND" : "DROP_AREA_NOT_FOUND",
      `No serviceable area is mapped to ${side.toLowerCase()} pincode ${normalized}`,
      { pincode: normalized, side },
    );
  }

  // Several areas may share a pincode inside one zone — that is unambiguous.
  // Across two zones it is not, and picking whichever row sorted first would
  // make the same address price differently between requests.
  const zones = new Map(matches.map((area) => [area.zone.id, area.zone]));
  if (zones.size > 1) {
    throw new RateEngineError(
      side === "PICKUP"
        ? "AMBIGUOUS_PICKUP_PINCODE"
        : "AMBIGUOUS_DROP_PINCODE",
      `Pincode ${normalized} is mapped to more than one zone, so it cannot be priced`,
      {
        pincode: normalized,
        zones: [...zones.values()].map((z) => ({ id: z.id, code: z.code })),
      },
    );
  }

  const area = matches[0];
  const zone = area.zone;

  if (!zone.isActive) {
    throw new RateEngineError(
      side === "PICKUP" ? "PICKUP_ZONE_INACTIVE" : "DROP_ZONE_INACTIVE",
      `Zone ${zone.code} is not currently served`,
      { pincode: normalized, zoneCode: zone.code },
    );
  }

  return {
    zone,
    summary: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      resolvedArea: { id: area.id, name: area.name, pincode: area.pincode },
    },
  };
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/** Parses a measurement and rejects anything that is not strictly positive. */
function readMeasurement(
  value: string | number,
  scale: number,
  label: string,
): bigint {
  let parsed: bigint;
  try {
    parsed = parseFixed(value, scale, label);
  } catch (error) {
    if (error instanceof DecimalParseError) {
      throw new RateEngineError("INVALID_MEASUREMENT", error.message, { label });
    }
    throw error;
  }

  if (parsed <= 0n) {
    throw new RateEngineError(
      "INVALID_MEASUREMENT",
      `${label} must be greater than zero`,
      { label, value: String(value) },
    );
  }
  return parsed;
}

/**
 * `(L × B × H) / divisor`, in grams.
 *
 * The dimensions are held as hundredths of a centimetre, so their product is in
 * units of 1e-6 cm³; dividing by `1000 × divisor` converts that straight to
 * grams in one step. Doing it as a single `bigint` division means the result is
 * rounded exactly once, at the end, rather than accumulating error through
 * three intermediate float multiplications.
 */
function volumetricWeightGrams(input: RateQuoteInput, divisor: number): bigint {
  const length = readMeasurement(
    input.dimensionsCm.lengthCm,
    DIMENSION_SCALE,
    "Length",
  );
  const breadth = readMeasurement(
    input.dimensionsCm.breadthCm,
    DIMENSION_SCALE,
    "Breadth",
  );
  const height = readMeasurement(
    input.dimensionsCm.heightCm,
    DIMENSION_SCALE,
    "Height",
  );

  return divideRoundHalf(length * breadth * height, 1000n * BigInt(divisor));
}

// ---------------------------------------------------------------------------
// Rate card lookup
// ---------------------------------------------------------------------------

function findRateCard(
  cards: readonly ConfigRateCard[],
  orderType: string,
  scope: string,
  fromZoneId: string,
  toZoneId: string,
  fromZoneCode: string,
  toZoneCode: string,
): ConfigRateCard {
  // The lookup is directional: a card is stored per ordered zone pair, so
  // NORTH→SOUTH is not assumed to price SOUTH→NORTH. Reusing the reverse card
  // would be a pricing decision the engine is not entitled to make.
  const matching = cards.filter(
    (card) =>
      card.orderType === orderType &&
      card.scope === scope &&
      card.fromZoneId === fromZoneId &&
      card.toZoneId === toZoneId,
  );

  const route = `${orderType} ${scope} ${fromZoneCode}→${toZoneCode}`;

  if (matching.length === 0) {
    throw new RateEngineError(
      "RATE_CARD_NOT_FOUND",
      `No rate card is configured for ${route}`,
      { orderType, scope, fromZoneCode, toZoneCode },
    );
  }

  const active = matching.find((card) => card.isActive);
  if (!active) {
    throw new RateEngineError(
      "RATE_CARD_INACTIVE",
      `The rate card for ${route} is deactivated`,
      { orderType, scope, fromZoneCode, toZoneCode, rateCardId: matching[0].id },
    );
  }

  return active;
}

// ---------------------------------------------------------------------------
// COD surcharge
// ---------------------------------------------------------------------------

function codSurchargeFor(
  input: RateQuoteInput,
  config: RateConfig,
  freight: bigint,
): { surcharge: bigint; breakdown: CodBreakdown | null } {
  if (input.paymentType !== "COD") {
    return { surcharge: 0n, breakdown: null };
  }

  const configured = config.codSurcharges.filter(
    (row) => row.orderType === input.orderType,
  );

  if (configured.length === 0) {
    throw new RateEngineError(
      "COD_SURCHARGE_NOT_CONFIGURED",
      `No COD surcharge is configured for ${input.orderType} orders`,
      { orderType: input.orderType },
    );
  }

  const active = configured.find((row) => row.isActive);
  if (!active) {
    throw new RateEngineError(
      "COD_SURCHARGE_INACTIVE",
      `The COD surcharge for ${input.orderType} orders is deactivated`,
      { orderType: input.orderType },
    );
  }

  return active.mode === "FIXED"
    ? fixedSurcharge(active)
    : percentageSurcharge(active, freight);
}

function fixedSurcharge(row: ConfigCodSurcharge) {
  if (row.amount === null) {
    throw new RateEngineError(
      "COD_SURCHARGE_MISCONFIGURED",
      `The FIXED COD surcharge for ${row.orderType} orders has no amount`,
      { orderType: row.orderType, mode: row.mode },
    );
  }

  const amount = parseFixed(row.amount, MONEY_SCALE, "COD amount");
  return {
    surcharge: amount,
    breakdown: {
      mode: "FIXED" as const,
      amount: formatFixed(amount, MONEY_SCALE),
    },
  };
}

function percentageSurcharge(row: ConfigCodSurcharge, freight: bigint) {
  if (row.percentage === null) {
    throw new RateEngineError(
      "COD_SURCHARGE_MISCONFIGURED",
      `The PERCENTAGE COD surcharge for ${row.orderType} orders has no percentage`,
      { orderType: row.orderType, mode: row.mode },
    );
  }

  // `percentage` is stored to two decimals, so 2.50 parses to 250 hundredths of
  // a percent. Dividing the product by 10 000 applies it and converts back to
  // minor currency units in one rounded step.
  const hundredths = parseFixed(row.percentage, MONEY_SCALE, "COD percentage");
  const computed = divideRoundHalf(freight * hundredths, 10_000n);

  const floor =
    row.minAmount === null
      ? null
      : parseFixed(row.minAmount, MONEY_SCALE, "COD minimum");

  const surcharge = floor !== null && floor > computed ? floor : computed;

  return {
    surcharge,
    breakdown: {
      mode: "PERCENTAGE" as const,
      percentage: formatFixed(hundredths, MONEY_SCALE),
      computed: formatFixed(computed, MONEY_SCALE),
      minAmount: floor === null ? null : formatFixed(floor, MONEY_SCALE),
      floorApplied: floor !== null && floor > computed,
    },
  };
}
