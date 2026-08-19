/**
 * Exact fixed-point arithmetic for the rate engine.
 *
 * Every value is carried as a `bigint` count of the smallest unit its column
 * allows: money in minor units (2 decimal places, matching `Decimal(10, 2)`)
 * and weight in grams (3 decimal places, matching `Decimal(10, 3)`).
 *
 * Nothing here uses the `number` type for a quantity that reaches a price.
 * Binary floats cannot represent most decimal fractions, and the freight
 * formula amplifies the error rather than hiding it: the per-kg term is
 * `ceil(chargeable - baseWeight)`, so a chargeable weight that should sit
 * exactly one kilo above the base slab can drift to `1.0000000000000002` and
 * round up to two, overcharging the customer a whole per-kg rate on an input
 * that looked like a round number. Integers make that boundary exact by
 * construction instead of by luck.
 */

/** Thrown for malformed numeric input; callers wrap it in a typed engine error. */
export class DecimalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecimalParseError";
    Object.setPrototypeOf(this, DecimalParseError.prototype);
  }
}

const PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a decimal string (or number) into an integer count of units at
 * `scale` decimal places. `parseFixed("40.5", 2)` is `4050n`.
 *
 * More precision than `scale` is rejected rather than truncated. Silently
 * dropping a digit off a price is the kind of rounding error that only shows
 * up in a monthly reconciliation, so it fails loudly at the edge instead.
 */
export function parseFixed(
  value: string | number,
  scale: number,
  label = "value",
): bigint {
  const raw = typeof value === "number" ? formatNumber(value, label) : value.trim();

  const match = PATTERN.exec(raw);
  if (!match) {
    throw new DecimalParseError(`${label} is not a valid decimal number: "${raw}"`);
  }

  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > scale) {
    throw new DecimalParseError(
      `${label} has more than ${scale} decimal place(s): "${raw}"`,
    );
  }

  const padded = fraction.padEnd(scale, "0");
  const magnitude = BigInt(whole + padded);
  return sign === "-" ? -magnitude : magnitude;
}

/**
 * A `number` input is only accepted when it is exactly representable as a
 * short decimal. Anything else (NaN, Infinity, 0.1 + 0.2) is refused, because
 * by the time a float reaches here its precision is already gone.
 */
function formatNumber(value: number, label: string): string {
  if (!Number.isFinite(value)) {
    throw new DecimalParseError(`${label} must be a finite number`);
  }
  if (!Number.isSafeInteger(Math.round(value * 1e6))) {
    throw new DecimalParseError(`${label} is too large or too precise to be exact`);
  }
  return String(value);
}

/** Renders an integer unit count back to a decimal string at `scale` places. */
export function formatFixed(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");

  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";

  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/**
 * Divides, rounding halves away from zero ("half up" for positive values).
 *
 * This is the rounding a customer expects to see on a percentage surcharge,
 * and it is applied exactly once — at the point the surcharge becomes a
 * currency amount — so no intermediate value is ever rounded twice.
 */
export function divideRoundHalf(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new DecimalParseError("Division by zero");
  }

  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;

  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/** Ceiling division for non-negative values — "or part thereof" weight slabs. */
export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new DecimalParseError("Ceiling division needs a positive denominator");
  }
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

export const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** Decimal places used by each kind of quantity, mirroring the Prisma columns. */
export const MONEY_SCALE = 2;
export const WEIGHT_SCALE = 3;
/** Centimetres are accepted to two decimal places. */
export const DIMENSION_SCALE = 2;
