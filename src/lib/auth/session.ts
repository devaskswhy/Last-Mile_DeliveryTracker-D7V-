import { cookies } from "next/headers";

import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
  type SessionPayload,
} from "./jwt";

/**
 * Server-side session helpers. Import only from Route Handlers, Server
 * Components and Server Actions -- `next/headers` is unavailable in middleware.
 */

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(
  maxAge: number = SESSION_MAX_AGE_SECONDS,
): SessionCookieOptions {
  return {
    // Not readable from JavaScript, so an XSS bug cannot exfiltrate the token.
    httpOnly: true,
    // Allowed over plain HTTP in development only.
    secure: process.env.NODE_ENV === "production",
    // `lax` keeps the cookie on top-level navigations while blocking it on
    // cross-site POSTs, which covers the common CSRF shapes.
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/** Cookie options that expire the session immediately (logout). */
export function clearedSessionCookieOptions(): SessionCookieOptions {
  return sessionCookieOptions(0);
}

/**
 * Reads and verifies the session from the incoming request's cookies.
 * Returns `null` when absent, malformed, expired or tampered with.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
export type { SessionPayload };
