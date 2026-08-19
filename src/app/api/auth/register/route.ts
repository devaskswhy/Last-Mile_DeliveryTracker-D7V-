import { Prisma } from "@prisma/client";

import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
} from "@/lib/auth/jwt";
import { sessionCookieOptions } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation/auth";

/** Self-service registration. Always creates a CUSTOMER -- staff are seeded. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return fail("Request body must be valid JSON", 400);

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { name, email, password, phone } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);

    // Relies on the unique index rather than a findFirst/create pair, which
    // would race two concurrent signups for the same address.
    const user = await prisma.user.create({
      data: { name, email, phone, passwordHash, role: "CUSTOMER" },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const response = ok({ user }, 201);
    response.cookies.set(
      AUTH_COOKIE_NAME,
      token,
      sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    );
    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("An account with that email already exists", 409);
    }

    console.error("[auth/register]", error);
    return fail("Could not create the account", 500);
  }
}
