import { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";

import { fail } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";

/**
 * Wraps an admin route handler with the ADMIN check and a uniform translation
 * of database errors into HTTP responses.
 *
 * Middleware already gates `/api/admin/*` on the ADMIN role. This is the second
 * layer: middleware trusts the JWT, which keeps asserting a role until it
 * expires, so `requireActiveUser` re-reads the account and rejects one that has
 * been deactivated or demoted since the token was issued.
 */
export async function adminRoute(
  handler: (admin: { id: string; email: string }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const admin = await requireActiveUser("ADMIN");
    return await handler(admin);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return fail(error.message, error.status);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target.join(", ") : undefined;
        return fail(
          fields
            ? `A record with that ${fields} already exists`
            : "A record with those values already exists",
          409,
        );
      }
      case "P2003":
        return fail(
          "That change conflicts with a record that references this one",
          409,
        );
      case "P2025":
        return fail("Record not found", 404);
      default:
        break;
    }
  }

  // CHECK constraints (rate-card scope, COD surcharge mode) surface as raw
  // Postgres errors rather than a typed Prisma code.
  const message = error instanceof Error ? error.message : "";
  if (message.includes("violates check constraint")) {
    if (message.includes("rate_cards_scope_matches_zone_pair")) {
      return fail(
        "Rate-card scope must match its zone pair: INTRA for one zone, INTER for two",
        422,
      );
    }
    if (message.includes("cod_surcharge_mode_matches_value")) {
      return fail(
        "A FIXED surcharge needs an amount; a PERCENTAGE surcharge needs a percentage",
        422,
      );
    }
    return fail("That record violates a database constraint", 422);
  }

  console.error("[admin]", error);
  return fail("Unexpected error", 500);
}
