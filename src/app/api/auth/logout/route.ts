import { ok } from "@/lib/api";
import { AUTH_COOKIE_NAME } from "@/lib/auth/jwt";
import { clearedSessionCookieOptions } from "@/lib/auth/session";

/**
 * Clears the session cookie. POST-only so a stray <img> or link cannot log a
 * user out, and idempotent -- signing out twice is not an error.
 */
export async function POST() {
  const response = ok({ signedOut: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", clearedSessionCookieOptions());
  return response;
}
