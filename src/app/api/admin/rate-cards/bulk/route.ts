import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { rateCardBulkSchema } from "@/lib/validation/rate-card";

export const dynamic = "force-dynamic";

/**
 * Creates many rate cards in one transaction, for closing coverage gaps.
 *
 * Adding a zone turns an N-zone grid into N+1, which needs `2 * ((N+1)^2 - N^2)`
 * new cards — eight of them for a third zone. Entering those one at a time is
 * where a gap gets left behind, so the admin UI reads the gap list and posts
 * the whole set with rates the admin supplies.
 *
 * All-or-nothing on purpose: a partial fill would leave coverage in a state
 * neither the admin nor the report can reason about.
 */
export async function POST(request: Request) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = rateCardBulkSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const { cards } = parsed.data;

    // Reject duplicates inside the payload itself. Without this the unique
    // index would reject the batch with a message about one row, and the admin
    // would not know which two collided.
    const seen = new Set<string>();
    for (const card of cards) {
      const key = `${card.orderType}::${card.fromZoneId}::${card.toZoneId}`;
      if (seen.has(key)) {
        return fail(
          "The request contains more than one card for the same order type and zone pair",
          422,
          { duplicateKey: key },
        );
      }
      seen.add(key);
    }

    const zoneIds = new Set(cards.flatMap((c) => [c.fromZoneId, c.toZoneId]));
    const known = await prisma.zone.findMany({
      where: { id: { in: [...zoneIds] } },
      select: { id: true },
    });
    if (known.length !== zoneIds.size) {
      return fail("One or more of those zones do not exist", 422);
    }

    const created = await prisma.$transaction(
      cards.map((card) => prisma.rateCard.create({ data: card })),
    );

    return ok({ created: created.length }, 201);
  });
}
