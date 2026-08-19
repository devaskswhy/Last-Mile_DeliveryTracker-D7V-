import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";

// Reads the session cookie, so it must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Returns the signed-in user. Also the smoke test for the whole auth chain:
 * middleware admits the request, then the handler re-verifies the cookie and
 * confirms the account is still active.
 */
export async function GET() {
  try {
    const user = await requireActiveUser();
    return ok({ user });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[api/me]", error);
    return fail("Could not load the current user", 500);
  }
}
