import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { hashResetToken, isResetTokenUsable } from "@/lib/auth/password-reset";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

const INVALID_MESSAGE =
  "This reset link is invalid or has expired. Request a new one.";

/**
 * Consumes a reset link and sets a new password.
 *
 * "Not found", "expired" and "already used" all return the same message and
 * status. Distinguishing them would tell a caller holding a dead token
 * something about a token they do not otherwise have any information about —
 * for instance, that a token existed and expired versus never having existed
 * at all, which is one bit more than a bare "no" needs to give away.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return fail("Request body must be valid JSON", 400);

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { token, password } = parsed.data;
  const tokenHash = hashResetToken(token);

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { isActive: true } },
      },
    });

    if (!record || !record.user.isActive || !isResetTokenUsable(record)) {
      return fail(INVALID_MESSAGE, 400);
    }

    const passwordHash = await hashPassword(password);

    // Setting the new password, marking this token spent, and invalidating
    // every other outstanding token for the account happen together: a second
    // valid link left over from an earlier request must not survive a
    // completed reset.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id }, usedAt: null },
      }),
    ]);

    return ok({ reset: true });
  } catch (error) {
    console.error("[auth/reset-password]", error);
    return fail("Could not reset the password", 500);
  }
}
