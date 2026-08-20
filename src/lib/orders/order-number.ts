import { randomBytes } from "node:crypto";

/**
 * Human-readable order reference: `LM-YYYYMMDD-XXXXXX`.
 *
 * The suffix is random rather than sequential on purpose. A sequential counter
 * would leak business volume to anyone holding two order numbers, and would
 * need its own locked row to stay unique under concurrent creates. Random
 * removes both problems, at the cost of needing a uniqueness check — which the
 * unique index provides anyway.
 *
 * Crockford's alphabet drops I, L, O and U, so a reference read over the phone
 * cannot be transcribed into a different valid one.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SUFFIX_LENGTH = 6;

export function generateOrderNumber(now = new Date()): string {
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");

  // Rejection-free: 32 symbols divide 256 evenly, so no modulo bias.
  const bytes = randomBytes(SUFFIX_LENGTH);
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return `LM-${date}-${suffix}`;
}
