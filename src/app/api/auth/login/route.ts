import { fail, ok, readJson, validationFailed } from "@/lib/api";
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
} from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sessionCookieOptions } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";

/**
 * A bcrypt hash of a throwaway value, compared against when no user matches.
 * Without it, a missing account returns markedly faster than a wrong password,
 * which leaks whether an address is registered. Computed once per process.
 */
const decoyHashPromise = hashPassword("no-such-account-timing-decoy");

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return fail("Request body must be valid JSON", 400);

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });

    const passwordMatches = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, await decoyHashPromise);

    // One message for every failure mode, so the response never distinguishes
    // "unknown email" from "wrong password".
    if (!user || !passwordMatches || !user.isActive) {
      return fail("Invalid email or password", 401);
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const response = ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    response.cookies.set(
      AUTH_COOKIE_NAME,
      token,
      sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    );
    return response;
  } catch (error) {
    console.error("[auth/login]", error);
    return fail("Could not sign in", 500);
  }
}
