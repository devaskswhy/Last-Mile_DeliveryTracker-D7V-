import { ok, readJson, validationFailed } from "@/lib/api";
import { generateResetToken, hashResetToken, resetTokenExpiry } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/auth/reset-email";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

/** Always the same message, whether or not the account exists. */
const GENERIC_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

/**
 * Requests a password-reset link.
 *
 * The response is identical whether or not the address is registered. This is
 * the same discipline `/api/auth/login` already applies to its failure message
 * — a response that differed by account existence would let anyone enumerate
 * every registered email by trying addresses here, one request at a time.
 *
 * A found account gets a single active token: any previous unused tokens for
 * that user are deleted before the new one is created, so an old, still-valid
 * link from an earlier request cannot be used alongside a newer one.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === undefined) return ok({ message: GENERIC_MESSAGE });

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (user && user.isActive) {
      const rawToken = generateResetToken();

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(rawToken),
            expiresAt: resetTokenExpiry(),
          },
        }),
      ]);

      // Never allowed to change the response — a slow or failed provider must
      // not turn into a signal that distinguishes "account exists" from not.
      await sendPasswordResetEmail(user.email, user.name, rawToken).catch(
        (error) => {
          console.error("[auth/forgot-password] send failed", error);
        },
      );
    }
  } catch (error) {
    // Same reasoning: a database hiccup must not surface as a different
    // response, or it becomes exactly the oracle this endpoint exists to deny.
    console.error("[auth/forgot-password]", error);
  }

  return ok({ message: GENERIC_MESSAGE });
}
