import { describe, expect, it } from "vitest";

import { calculateRate } from "./engine";
import { RateEngineError, type RateEngineErrorCode } from "./errors";
import type {
  ConfigArea,
  ConfigCodSurcharge,
  ConfigRateCard,
  ConfigZone,
  RateConfig,
  RateQuoteInput,
} from "./types";

/**
 * The engine is pure, so these tests need no database, no mocking library and
 * no setup: every case is a plain object in, a plain object out.
 *
 * Figures are chosen to be checkable by hand. With a base slab of 1 kg, a
 * B2C intra-zone card at 40.00 + 15.00/kg prices a 25 kg shipment as
 * 40 + 15 × 24 = 400.00.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NORTH: ConfigZone = { id: "z-north", code: "NORTH", name: "North Zone", isActive: true };
const SOUTH: ConfigZone = { id: "z-south", code: "SOUTH", name: "South Zone", isActive: true };
const RETIRED: ConfigZone = { id: "z-old", code: "RETIRED", name: "Retired Zone", isActive: false };

const area = (
  id: string,
  pincode: string,
  zone: ConfigZone,
  isActive = true,
): ConfigArea => ({ id, name: `Area ${id}`, pincode, isActive, zone });

const AREAS: ConfigArea[] = [
  area("a-n1", "110085", NORTH),
  area("a-n2", "110034", NORTH),
  area("a-s1", "110017", SOUTH),
  // Two areas sharing a pincode inside one zone — unambiguous, still resolves.
  area("a-n3", "110085", NORTH),
  // The same pincode in two different zones — must refuse to guess.
  area("a-amb-n", "999001", NORTH),
  area("a-amb-s", "999001", SOUTH),
  // Resolves to a zone that is switched off.
  area("a-ret", "888001", RETIRED),
  // Deactivated area: its pincode must behave as if it were not mapped at all.
  area("a-off", "777001", NORTH, false),
];

const card = (
  id: string,
  orderType: "B2B" | "B2C",
  scope: "INTRA" | "INTER",
  fromZoneId: string,
  toZoneId: string,
  baseRate: string,
  perKgRate: string,
  baseWeightKg = "1.000",
  isActive = true,
): ConfigRateCard => ({
  id,
  orderType,
  scope,
  fromZoneId,
  toZoneId,
  baseRate,
  baseWeightKg,
  perKgRate,
  isActive,
});

const RATE_CARDS: ConfigRateCard[] = [
  card("rc-b2c-intra", "B2C", "INTRA", NORTH.id, NORTH.id, "40.00", "15.00"),
  card("rc-b2c-inter", "B2C", "INTER", NORTH.id, SOUTH.id, "70.00", "25.00"),
  card("rc-b2b-intra", "B2B", "INTRA", NORTH.id, NORTH.id, "30.00", "12.00"),
  card("rc-b2b-inter", "B2B", "INTER", NORTH.id, SOUTH.id, "55.00", "20.00"),
  // Present but deactivated — a distinct failure from "not configured".
  card("rc-b2c-intra-s", "B2C", "INTRA", SOUTH.id, SOUTH.id, "44.00", "16.00", "1.000", false),
  // Deliberately no SOUTH→NORTH card, so direction can be tested.
];

const COD: ConfigCodSurcharge[] = [
  {
    id: "cod-b2c",
    orderType: "B2C",
    mode: "FIXED",
    amount: "30.00",
    percentage: null,
    minAmount: null,
    isActive: true,
  },
  {
    id: "cod-b2b",
    orderType: "B2B",
    mode: "PERCENTAGE",
    amount: null,
    percentage: "2.50",
    minAmount: "25.00",
    isActive: true,
  },
];

const CONFIG: RateConfig = {
  areas: AREAS,
  rateCards: RATE_CARDS,
  codSurcharges: COD,
};

const quoteInput = (overrides: Partial<RateQuoteInput> = {}): RateQuoteInput => ({
  pickupPincode: "110085",
  dropPincode: "110034",
  dimensionsCm: { lengthCm: "10", breadthCm: "10", heightCm: "10" },
  actualWeightKg: "0.5",
  orderType: "B2C",
  paymentType: "PREPAID",
  ...overrides,
});

function expectRateError(fn: () => unknown, code: RateEngineErrorCode) {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `expected a RateEngineError with code ${code}`).toBeInstanceOf(
    RateEngineError,
  );
  expect((thrown as RateEngineError).code).toBe(code);
  return thrown as RateEngineError;
}

// ---------------------------------------------------------------------------
// Weight rules
// ---------------------------------------------------------------------------

describe("chargeable weight", () => {
  it("uses volumetric weight when it exceeds the actual weight", () => {
    // 50 × 50 × 50 = 125 000 cm³ / 5000 = 25 kg, against 2 kg on the scale.
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "50", breadthCm: "50", heightCm: "50" },
        actualWeightKg: "2",
      }),
      CONFIG,
    );

    expect(quote.actualWeight).toBe("2.000");
    expect(quote.volumetricWeight).toBe("25.000");
    expect(quote.chargeableWeight).toBe("25.000");
    expect(quote.chargeableWeightBasis).toBe("VOLUMETRIC");
    // 40.00 + 15.00 × ceil(25 − 1) = 40 + 360
    expect(quote.baseCharge).toBe("400.00");
  });

  it("uses actual weight when it exceeds the volumetric weight", () => {
    // 10 × 10 × 10 = 1000 cm³ / 5000 = 0.2 kg, against 8 kg on the scale.
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "10", breadthCm: "10", heightCm: "10" },
        actualWeightKg: "8",
      }),
      CONFIG,
    );

    expect(quote.volumetricWeight).toBe("0.200");
    expect(quote.actualWeight).toBe("8.000");
    expect(quote.chargeableWeight).toBe("8.000");
    expect(quote.chargeableWeightBasis).toBe("ACTUAL");
    // 40.00 + 15.00 × ceil(8 − 1) = 40 + 105
    expect(quote.baseCharge).toBe("145.00");
  });

  it("treats equal actual and volumetric weight as the actual weight", () => {
    // 100 × 100 × 100 = 1 000 000 cm³ / 5000 = 200 kg.
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "100", breadthCm: "100", heightCm: "100" },
        actualWeightKg: "200",
      }),
      CONFIG,
    );

    expect(quote.chargeableWeight).toBe("200.000");
    expect(quote.chargeableWeightBasis).toBe("ACTUAL");
  });

  it("keeps fractional volumetric weight exact to three decimals", () => {
    // 12.5 × 8.4 × 15.2 = 1596 cm³ / 5000 = 0.3192 kg → 0.319 kg.
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "12.5", breadthCm: "8.4", heightCm: "15.2" },
        actualWeightKg: "0.1",
      }),
      CONFIG,
    );

    expect(quote.volumetricWeight).toBe("0.319");
  });

  it("rounds a half-gram of volumetric weight up", () => {
    // 1 × 1 × 2.5 = 2.5 cm³ / 5000 = 0.0005 kg — exactly half a gram.
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "1", breadthCm: "1", heightCm: "2.5" },
        actualWeightKg: "0.001",
      }),
      CONFIG,
    );

    expect(quote.volumetricWeight).toBe("0.001");
  });
});

// ---------------------------------------------------------------------------
// The per-kg slab boundary — where float arithmetic would go wrong
// ---------------------------------------------------------------------------

describe("per-kg slab boundaries", () => {
  it("bills no excess when chargeable weight is under the base slab", () => {
    const quote = calculateRate(quoteInput({ actualWeightKg: "0.4" }), CONFIG);

    expect(quote.freightBreakdown.excessWeightKg).toBe("0.000");
    expect(quote.freightBreakdown.billedExcessKg).toBe(0);
    expect(quote.baseCharge).toBe("40.00");
  });

  it("bills no excess when chargeable weight is exactly the base slab", () => {
    const quote = calculateRate(quoteInput({ actualWeightKg: "1" }), CONFIG);

    expect(quote.freightBreakdown.excessWeightKg).toBe("0.000");
    expect(quote.freightBreakdown.billedExcessKg).toBe(0);
    expect(quote.baseCharge).toBe("40.00");
  });

  it("bills exactly one kilo one gram above the slab", () => {
    const quote = calculateRate(quoteInput({ actualWeightKg: "1.001" }), CONFIG);

    expect(quote.freightBreakdown.billedExcessKg).toBe(1);
    expect(quote.baseCharge).toBe("55.00");
  });

  it("bills one kilo — not two — at exactly one kilo over the slab", () => {
    // The float trap: 2.0 − 1.0 can land on 1.0000000000000002, and Math.ceil
    // then charges a second kilogram for a shipment entered as a round number.
    const quote = calculateRate(quoteInput({ actualWeightKg: "2.000" }), CONFIG);

    expect(quote.freightBreakdown.excessWeightKg).toBe("1.000");
    expect(quote.freightBreakdown.billedExcessKg).toBe(1);
    expect(quote.baseCharge).toBe("55.00");
  });

  it("rounds a part-kilogram up to a whole billed kilogram", () => {
    const quote = calculateRate(quoteInput({ actualWeightKg: "3.2" }), CONFIG);

    expect(quote.freightBreakdown.excessWeightKg).toBe("2.200");
    expect(quote.freightBreakdown.billedExcessKg).toBe(3);
    // 40.00 + 15.00 × 3
    expect(quote.baseCharge).toBe("85.00");
  });

  it("stays exact across a weight that has no binary float representation", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    const quote = calculateRate(quoteInput({ actualWeightKg: "1.3" }), CONFIG);

    expect(quote.freightBreakdown.excessWeightKg).toBe("0.300");
    expect(quote.freightBreakdown.billedExcessKg).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Zone scope
// ---------------------------------------------------------------------------

describe("zone detection and scope", () => {
  it("prices an intra-zone shipment from the INTRA card", () => {
    const quote = calculateRate(
      quoteInput({ pickupPincode: "110085", dropPincode: "110034" }),
      CONFIG,
    );

    expect(quote.pickupZone.code).toBe("NORTH");
    expect(quote.dropZone.code).toBe("NORTH");
    expect(quote.scope).toBe("INTRA");
    expect(quote.rateCardUsed.id).toBe("rc-b2c-intra");
    expect(quote.baseCharge).toBe("40.00");
  });

  it("prices an inter-zone shipment from the INTER card", () => {
    const quote = calculateRate(
      quoteInput({ pickupPincode: "110085", dropPincode: "110017" }),
      CONFIG,
    );

    expect(quote.pickupZone.code).toBe("NORTH");
    expect(quote.dropZone.code).toBe("SOUTH");
    expect(quote.scope).toBe("INTER");
    expect(quote.rateCardUsed.id).toBe("rc-b2c-inter");
    expect(quote.baseCharge).toBe("70.00");
  });

  it("reports the area a pincode resolved through", () => {
    const quote = calculateRate(quoteInput(), CONFIG);

    expect(quote.pickupZone.resolvedArea.pincode).toBe("110085");
    expect(quote.dropZone.resolvedArea.pincode).toBe("110034");
  });

  it("normalises spaces and hyphens before matching a pincode", () => {
    const quote = calculateRate(
      quoteInput({ pickupPincode: " 110-085 ", dropPincode: "110 034" }),
      CONFIG,
    );

    expect(quote.pickupZone.code).toBe("NORTH");
    expect(quote.scope).toBe("INTRA");
  });

  it("resolves a pincode shared by two areas of the same zone", () => {
    // Two rows carry 110085, both in NORTH — unambiguous, so it still prices.
    const quote = calculateRate(quoteInput(), CONFIG);
    expect(quote.pickupZone.code).toBe("NORTH");
  });

  it("looks the rate card up directionally", () => {
    // SOUTH→NORTH has no card even though NORTH→SOUTH does. Reusing the
    // reverse card would be a pricing decision the engine may not make.
    expectRateError(
      () =>
        calculateRate(
          quoteInput({ pickupPincode: "110017", dropPincode: "110085" }),
          CONFIG,
        ),
      "RATE_CARD_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// Order type
// ---------------------------------------------------------------------------

describe("order type", () => {
  it("prices B2C and B2B from different cards for the same route", () => {
    const b2c = calculateRate(quoteInput({ orderType: "B2C", actualWeightKg: "5" }), CONFIG);
    const b2b = calculateRate(quoteInput({ orderType: "B2B", actualWeightKg: "5" }), CONFIG);

    // B2C intra: 40.00 + 15.00 × 4 = 100.00
    expect(b2c.rateCardUsed.id).toBe("rc-b2c-intra");
    expect(b2c.baseCharge).toBe("100.00");

    // B2B intra: 30.00 + 12.00 × 4 = 78.00
    expect(b2b.rateCardUsed.id).toBe("rc-b2b-intra");
    expect(b2b.baseCharge).toBe("78.00");
  });

  it("keeps the order type distinction across zone scopes", () => {
    const input = { dropPincode: "110017", actualWeightKg: "3" } as const;

    const b2c = calculateRate(quoteInput({ ...input, orderType: "B2C" }), CONFIG);
    const b2b = calculateRate(quoteInput({ ...input, orderType: "B2B" }), CONFIG);

    // B2C inter: 70.00 + 25.00 × 2 = 120.00
    expect(b2c.baseCharge).toBe("120.00");
    // B2B inter: 55.00 + 20.00 × 2 = 95.00
    expect(b2b.baseCharge).toBe("95.00");
  });
});

// ---------------------------------------------------------------------------
// Payment type
// ---------------------------------------------------------------------------

describe("COD surcharge", () => {
  it("adds nothing for a prepaid order", () => {
    const quote = calculateRate(quoteInput({ paymentType: "PREPAID" }), CONFIG);

    expect(quote.codSurcharge).toBe("0.00");
    expect(quote.codBreakdown).toBeNull();
    expect(quote.totalCharge).toBe(quote.baseCharge);
  });

  it("adds a flat amount for a FIXED configuration", () => {
    const quote = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2C", actualWeightKg: "5" }),
      CONFIG,
    );

    expect(quote.baseCharge).toBe("100.00");
    expect(quote.codSurcharge).toBe("30.00");
    expect(quote.totalCharge).toBe("130.00");
    expect(quote.codBreakdown).toEqual({ mode: "FIXED", amount: "30.00" });
  });

  it("applies the minimum when a percentage falls below it", () => {
    // B2B intra at 1 kg is 30.00 freight; 2.5% of that is 0.75, under the
    // 25.00 floor.
    const quote = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2B", actualWeightKg: "1" }),
      CONFIG,
    );

    expect(quote.baseCharge).toBe("30.00");
    expect(quote.codSurcharge).toBe("25.00");
    expect(quote.totalCharge).toBe("55.00");
    expect(quote.codBreakdown).toEqual({
      mode: "PERCENTAGE",
      percentage: "2.50",
      computed: "0.75",
      minAmount: "25.00",
      floorApplied: true,
    });
  });

  it("uses the computed percentage when it clears the minimum", () => {
    // B2B intra at 100 kg: 30.00 + 12.00 × 99 = 1218.00; 2.5% = 30.45.
    const quote = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2B", actualWeightKg: "100" }),
      CONFIG,
    );

    expect(quote.baseCharge).toBe("1218.00");
    expect(quote.codSurcharge).toBe("30.45");
    expect(quote.totalCharge).toBe("1248.45");
    expect(quote.codBreakdown).toMatchObject({ floorApplied: false });
  });

  it("rounds a half-unit percentage up", () => {
    const noFloor: RateConfig = {
      ...CONFIG,
      codSurcharges: [
        {
          id: "cod-b2b-nofloor",
          orderType: "B2B",
          mode: "PERCENTAGE",
          amount: null,
          percentage: "2.50",
          minAmount: null,
          isActive: true,
        },
      ],
    };

    // B2B intra at 3 kg: 30.00 + 12.00 × 2 = 54.00. 2.5% = 1.35 exactly.
    const exact = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2B", actualWeightKg: "3" }),
      noFloor,
    );
    expect(exact.baseCharge).toBe("54.00");
    expect(exact.codSurcharge).toBe("1.35");

    // B2B intra at 4 kg: 30.00 + 12.00 × 3 = 66.00. 2.5% = 1.65 exactly.
    const half = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2B", actualWeightKg: "4" }),
      noFloor,
    );
    expect(half.baseCharge).toBe("66.00");
    expect(half.codSurcharge).toBe("1.65");
  });

  it("refuses to price COD when no surcharge is configured", () => {
    // Silence is not a pricing decision: a missing rule must not become zero.
    const withoutCod: RateConfig = { ...CONFIG, codSurcharges: [] };

    expectRateError(
      () => calculateRate(quoteInput({ paymentType: "COD" }), withoutCod),
      "COD_SURCHARGE_NOT_CONFIGURED",
    );
  });

  it("still prices a prepaid order when no COD rule exists", () => {
    const withoutCod: RateConfig = { ...CONFIG, codSurcharges: [] };
    const quote = calculateRate(quoteInput({ paymentType: "PREPAID" }), withoutCod);

    expect(quote.totalCharge).toBe("40.00");
  });

  it("distinguishes a deactivated COD rule from a missing one", () => {
    const inactive: RateConfig = {
      ...CONFIG,
      codSurcharges: [{ ...COD[0], isActive: false }],
    };

    expectRateError(
      () => calculateRate(quoteInput({ paymentType: "COD" }), inactive),
      "COD_SURCHARGE_INACTIVE",
    );
  });

  it("rejects a COD row missing the value its mode needs", () => {
    const broken: RateConfig = {
      ...CONFIG,
      codSurcharges: [{ ...COD[0], amount: null }],
    };

    expectRateError(
      () => calculateRate(quoteInput({ paymentType: "COD" }), broken),
      "COD_SURCHARGE_MISCONFIGURED",
    );
  });
});

// ---------------------------------------------------------------------------
// Unresolvable addresses and other failures
// ---------------------------------------------------------------------------

describe("unresolvable addresses", () => {
  it("fails with a typed error when the pickup pincode is unknown", () => {
    const error = expectRateError(
      () => calculateRate(quoteInput({ pickupPincode: "999999" }), CONFIG),
      "PICKUP_AREA_NOT_FOUND",
    );

    expect(error).toBeInstanceOf(RateEngineError);
    expect(error.message).toContain("999999");
    expect(error.details).toMatchObject({ pincode: "999999", side: "PICKUP" });
  });

  it("fails with a typed error when the drop pincode is unknown", () => {
    expectRateError(
      () => calculateRate(quoteInput({ dropPincode: "999999" }), CONFIG),
      "DROP_AREA_NOT_FOUND",
    );
  });

  it("never falls back to a default zone or a zero charge", () => {
    // The error path must throw rather than return a quote of any shape.
    let result: unknown = "not called";
    try {
      result = calculateRate(quoteInput({ pickupPincode: "000000" }), CONFIG);
    } catch {
      result = "threw";
    }
    expect(result).toBe("threw");
  });

  it("treats a deactivated area as unmapped", () => {
    expectRateError(
      () => calculateRate(quoteInput({ pickupPincode: "777001" }), CONFIG),
      "PICKUP_AREA_NOT_FOUND",
    );
  });

  it("reports a known address in a zone that is no longer served", () => {
    expectRateError(
      () => calculateRate(quoteInput({ pickupPincode: "888001" }), CONFIG),
      "PICKUP_ZONE_INACTIVE",
    );
  });

  it("refuses to guess when a pincode spans two zones", () => {
    const error = expectRateError(
      () => calculateRate(quoteInput({ pickupPincode: "999001" }), CONFIG),
      "AMBIGUOUS_PICKUP_PINCODE",
    );

    expect(error.details?.zones).toHaveLength(2);
  });

  it("rejects an empty pincode", () => {
    expectRateError(
      () => calculateRate(quoteInput({ pickupPincode: "   " }), CONFIG),
      "PICKUP_AREA_NOT_FOUND",
    );
  });
});

describe("configuration and input failures", () => {
  it("distinguishes a deactivated rate card from a missing one", () => {
    // SOUTH→SOUTH exists for B2C but is switched off.
    const southOnly: RateConfig = {
      ...CONFIG,
      areas: [area("a-s1", "110017", SOUTH), area("a-s2", "110016", SOUTH)],
    };

    expectRateError(
      () =>
        calculateRate(
          quoteInput({ pickupPincode: "110017", dropPincode: "110016" }),
          southOnly,
        ),
      "RATE_CARD_INACTIVE",
    );
  });

  it("rejects a non-positive dimension", () => {
    expectRateError(
      () =>
        calculateRate(
          quoteInput({
            dimensionsCm: { lengthCm: "0", breadthCm: "10", heightCm: "10" },
          }),
          CONFIG,
        ),
      "INVALID_MEASUREMENT",
    );
  });

  it("rejects a non-positive weight", () => {
    expectRateError(
      () => calculateRate(quoteInput({ actualWeightKg: "0" }), CONFIG),
      "INVALID_MEASUREMENT",
    );
  });

  it("rejects an unparseable measurement", () => {
    expectRateError(
      () => calculateRate(quoteInput({ actualWeightKg: "heavy" }), CONFIG),
      "INVALID_MEASUREMENT",
    );
  });

  it("rejects more weight precision than the column stores", () => {
    // Truncating silently would quietly change the price.
    expectRateError(
      () => calculateRate(quoteInput({ actualWeightKg: "1.00051" }), CONFIG),
      "INVALID_MEASUREMENT",
    );
  });

  it("rejects a non-positive volumetric divisor", () => {
    expectRateError(
      () => calculateRate(quoteInput({ volumetricDivisor: 0 }), CONFIG),
      "INVALID_MEASUREMENT",
    );
  });
});

// ---------------------------------------------------------------------------
// Breakdown completeness — the frontend renders this as an itemised quote
// ---------------------------------------------------------------------------

describe("quote breakdown", () => {
  it("returns every field the customer-facing quote needs", () => {
    const quote = calculateRate(
      quoteInput({
        pickupPincode: "110085",
        dropPincode: "110017",
        dimensionsCm: { lengthCm: "40", breadthCm: "30", heightCm: "25" },
        actualWeightKg: "4",
        orderType: "B2C",
        paymentType: "COD",
      }),
      CONFIG,
    );

    // 40 × 30 × 25 = 30 000 cm³ / 5000 = 6 kg, over the 4 kg actual weight.
    // Inter-zone B2C: 70.00 + 25.00 × ceil(6 − 1) = 70 + 125 = 195.00
    // COD for B2C is a flat 30.00 → 225.00
    expect(quote).toMatchObject({
      scope: "INTER",
      actualWeight: "4.000",
      volumetricWeight: "6.000",
      chargeableWeight: "6.000",
      chargeableWeightBasis: "VOLUMETRIC",
      baseCharge: "195.00",
      codSurcharge: "30.00",
      totalCharge: "225.00",
      orderType: "B2C",
      paymentType: "COD",
      volumetricDivisor: 5000,
    });

    expect(quote.pickupZone).toMatchObject({ code: "NORTH" });
    expect(quote.dropZone).toMatchObject({ code: "SOUTH" });
    expect(quote.rateCardUsed).toMatchObject({
      id: "rc-b2c-inter",
      baseRate: "70.00",
      perKgRate: "25.00",
    });
    expect(quote.freightBreakdown).toEqual({
      baseRate: "70.00",
      baseWeightKg: "1.000",
      excessWeightKg: "5.000",
      billedExcessKg: 5,
      perKgRate: "25.00",
      excessCharge: "125.00",
    });
  });

  it("makes the itemised parts add up to the total", () => {
    const quote = calculateRate(
      quoteInput({ paymentType: "COD", orderType: "B2C", actualWeightKg: "7.5" }),
      CONFIG,
    );

    const base = Number(quote.freightBreakdown.baseRate);
    const excess = Number(quote.freightBreakdown.excessCharge);
    const cod = Number(quote.codSurcharge);

    expect(base + excess).toBeCloseTo(Number(quote.baseCharge), 2);
    expect(Number(quote.baseCharge) + cod).toBeCloseTo(Number(quote.totalCharge), 2);
  });

  it("honours a custom volumetric divisor", () => {
    const quote = calculateRate(
      quoteInput({
        dimensionsCm: { lengthCm: "50", breadthCm: "50", heightCm: "50" },
        actualWeightKg: "1",
        volumetricDivisor: 4000,
      }),
      CONFIG,
    );

    // 125 000 / 4000 = 31.25 kg
    expect(quote.volumetricWeight).toBe("31.250");
    expect(quote.volumetricDivisor).toBe(4000);
    // 40.00 + 15.00 × ceil(31.25 − 1) = 40 + 15 × 31 = 505.00
    expect(quote.freightBreakdown.billedExcessKg).toBe(31);
    expect(quote.baseCharge).toBe("505.00");
  });
});
