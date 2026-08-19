/**
 * Rate engine — public surface.
 *
 * `calculateRate` is pure: same inputs, same output, no I/O. `loadRateConfig`
 * is the only part that touches the database, and it is imported separately so
 * a consumer that already has the configuration (a test, a batch re-price, a
 * what-if tool) never pulls Prisma in behind it.
 */
export { calculateRate, normalizePincode, DEFAULT_VOLUMETRIC_DIVISOR } from "./engine";
export { loadRateConfig } from "./config-source";
export { RateEngineError, isAddressError } from "./errors";
export type { RateEngineErrorCode } from "./errors";
export type {
  CodBreakdown,
  ConfigArea,
  ConfigCodSurcharge,
  ConfigRateCard,
  ConfigZone,
  Dimensions,
  FreightBreakdown,
  RateCardSummary,
  RateConfig,
  RateQuote,
  RateQuoteInput,
  ZoneSummary,
} from "./types";
