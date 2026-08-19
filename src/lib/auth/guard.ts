import { prisma } from "@/lib/prisma";

import { getSession } from "./session";
import type { Role } from "./roles";
import type { SessionPayload } from "./jwt";

/**
 * Route-handler guards.
 *
 * These re-verify the session cookie rather than reading the `x-user-id`
 * header that middleware injects. Middleware overwrites that header on every
 * path it matches, but a handler reached by some future unmatched path would
 * otherwise trust a client-supplied value. Verifying the cookie costs one
 * HMAC check and removes the question entirely.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Throws `AuthError` when there is no valid session. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("Authentication required", 401);
  return session;
}

/** Throws `AuthError` unless the session carries one of `allowed`. */
export async function requireRole(
  ...allowed: readonly Role[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }
  return session;
}

/**
 * Confirms the account still exists and is active. Use on anything sensitive:
 * the JWT keeps asserting a role until it expires, even after an admin
 * deactivates the user or changes their role.
 */
export async function requireActiveUser(...allowed: readonly Role[]) {
  const session = allowed.length
    ? await requireRole(...allowed)
    : await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new AuthError("Account is no longer active", 401);
  }
  if (allowed.length && !allowed.includes(user.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }

  return user;
}
