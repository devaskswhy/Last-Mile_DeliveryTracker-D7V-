import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password-reset token mechanics.
 *
 * The raw token is what gets emailed; only its hash is ever stored. That
 * mirrors why a password is stored as a bcrypt hash rather than the password
 * itself — a leaked `password_reset_tokens` row (a backup, a read replica, a
 * misconfigured log) must not itself be a working credential. SHA-256 rather
 * than bcrypt here: the token is 256 bits of `crypto.randomBytes`, already
 * far too much entropy to brute-force, so there is nothing for a slow,
 * salted hash to defend against that a fast one does not — and a fast hash is
 * what makes an indexed, O(1) lookup by token possible in the first place.
 */

const TOKEN_BYTES = 32;

/** How long a reset link stays valid. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** A fresh raw token — 32 bytes of CSRNG, hex-encoded. */
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex hashes.
 *
 * The lookup itself already narrows to one row by hash (a database index, not
 * a scan), so this is not closing a timing channel that exists today — it is
 * cheap insurance against a future refactor that compares tokens in
 * application code instead.
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function resetTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

export function isResetTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now = new Date(),
): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}
