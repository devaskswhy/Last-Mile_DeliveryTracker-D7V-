// Imported from subpaths rather than the "jose" barrel. The barrel re-exports
// the JWE (encrypted-token) code, whose deflate helper touches CompressionStream
// -- which the Edge Runtime static analysis flags as unsupported, even though
// this module only ever signs and verifies JWS. Narrow imports drop that branch
// from the middleware bundle and the warning with it.
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

import { isRole, type Role } from "./roles";

/**
 * Session token signing and verification.
 *
 * `jose` is used rather than a Node-only JWT library because this module is
 * imported by `src/middleware.ts`, which runs on the Edge runtime. Everything
 * here must stay free of Node built-ins and of `@prisma/client`.
 *
 * `process.env.X` is referenced literally (never `process.env[key]`) so Next
 * can inline the values into the Edge bundle at build time.
 */

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "lm_session";

const JWT_ISSUER = "last-mile-delivery-tracker";
const JWT_AUDIENCE = "last-mile-delivery-tracker:web";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters. Copy .env.example to .env and set it.",
    );
  }
  return new TextEncoder().encode(secret);
}

function getMaxAgeSeconds(): number {
  const raw = Number(process.env.JWT_EXPIRES_IN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 604800;
}

export const SESSION_MAX_AGE_SECONDS = getMaxAgeSeconds();

export interface SessionPayload {
  /** User id (JWT `sub`). */
  userId: string;
  email: string;
  role: Role;
}

export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + SESSION_MAX_AGE_SECONDS)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(getSecretKey());
}

/**
 * Verifies signature, expiry, issuer and audience.
 * Returns `null` for any invalid token rather than throwing, so callers can
 * treat "no session" and "bad session" identically.
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    });

    const { sub, email, role } = payload as {
      sub?: string;
      email?: unknown;
      role?: unknown;
    };

    if (!sub || typeof email !== "string" || !isRole(role)) return null;

    return { userId: sub, email, role };
  } catch {
    return null;
  }
}
