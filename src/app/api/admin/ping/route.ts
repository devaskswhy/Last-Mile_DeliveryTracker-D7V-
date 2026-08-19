import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";

// Reads the session cookie, so it must never be prerendered.
export const dynamic = "force-dynamic";

/** ADMIN-only probe. Middleware rejects other roles before this runs. */
export async function GET() {
  try {
    const user = await requireActiveUser("ADMIN");
    return ok({ scope: "admin", user });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Unexpected error", 500);
  }
}
