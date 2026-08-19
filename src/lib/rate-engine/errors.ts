/**
 * Typed failures from the rate engine.
 *
 * Every one of these is a case where the engine *cannot* produce a price. None
 * of them falls back to a default, and in particular a missing COD surcharge
 * does not quietly become zero: silence is not a pricing decision, and a quote
 * that under-charges without telling anyone is worse than a quote that fails.
 *
 * The `code` is the stable contract. The API route maps it to a status, and the
 * frontend can branch on it — "we do not deliver to that pincode" is a message
 * the customer can act on, while "no rate card for that route" is one only an
 * admin can.
 */
export type RateEngineErrorCode =
  /** The pincode matches no active area. The customer can change the address. */
  | "PICKUP_AREA_NOT_FOUND"
  | "DROP_AREA_NOT_FOUND"
  /** The area resolved, but its zone is switched off — a known, unserved place. */
  | "PICKUP_ZONE_INACTIVE"
  | "DROP_ZONE_INACTIVE"
  /** One pincode maps to areas in two different zones; refusing to guess. */
  | "AMBIGUOUS_PICKUP_PINCODE"
  | "AMBIGUOUS_DROP_PINCODE"
  /** No rate card at all for this order type and zone pair. */
  | "RATE_CARD_NOT_FOUND"
  /** A card exists but is deactivated — distinct, because the fix differs. */
  | "RATE_CARD_INACTIVE"
  /** COD was requested with no configured rule for this order type. */
  | "COD_SURCHARGE_NOT_CONFIGURED"
  | "COD_SURCHARGE_INACTIVE"
  /** The stored COD row does not carry the value its mode needs. */
  | "COD_SURCHARGE_MISCONFIGURED"
  /** Dimensions or weight are absent, unparseable, or not positive. */
  | "INVALID_MEASUREMENT";

export interface RateEngineErrorDetails {
  [key: string]: unknown;
}

export class RateEngineError extends Error {
  readonly code: RateEngineErrorCode;
  readonly details?: RateEngineErrorDetails;

  constructor(
    code: RateEngineErrorCode,
    message: string,
    details?: RateEngineErrorDetails,
  ) {
    super(message);
    this.name = "RateEngineError";
    this.code = code;
    this.details = details;
    // Restores the prototype chain so `instanceof` holds after transpilation.
    Object.setPrototypeOf(this, RateEngineError.prototype);
  }
}

/** True when the failure is something the customer can fix by editing the form. */
export function isAddressError(code: RateEngineErrorCode): boolean {
  return (
    code === "PICKUP_AREA_NOT_FOUND" ||
    code === "DROP_AREA_NOT_FOUND" ||
    code === "PICKUP_ZONE_INACTIVE" ||
    code === "DROP_ZONE_INACTIVE" ||
    code === "INVALID_MEASUREMENT"
  );
}
