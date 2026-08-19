import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { serializeDecimals } from "@/lib/serialize";
import { rateCardUpdateSchema } from "@/lib/validation/rate-card";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const DECIMAL_FIELDS = ["baseRate", "baseWeightKg", "perKgRate"] as const;
const zoneSelect = { select: { id: true, code: true, name: true } };

export async function GET(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const card = await prisma.rateCard.findUnique({
      where: { id: params.id },
      include: { fromZone: zoneSelect, toZone: zoneSelect },
    });
    if (!card) return fail("Rate card not found", 404);
    return ok({ rateCard: serializeDecimals(card, DECIMAL_FIELDS) });
  });
}

/** Rates and the active flag only — see `rateCardUpdateSchema` on why the zone
 *  pair and order type are immutable. */
export async function PATCH(request: Request, { params }: Params) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = rateCardUpdateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const card = await prisma.rateCard.update({
      where: { id: params.id },
      data: parsed.data,
      include: { fromZone: zoneSelect, toZone: zoneSelect },
    });

    return ok({ rateCard: serializeDecimals(card, DECIMAL_FIELDS) });
  });
}

/**
 * Orders snapshot `rateCardId` for auditability, so a card that has priced
 * anything is deactivated rather than removed — deleting it would leave those
 * orders pointing at nothing and destroy the record of how they were charged.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const card = await prisma.rateCard.findUnique({ where: { id: params.id } });
    if (!card) return fail("Rate card not found", 404);

    const usedBy = await prisma.order.count({ where: { rateCardId: card.id } });
    if (usedBy > 0) {
      return fail(
        `This card priced ${usedBy} order(s) and cannot be deleted without losing that history. Deactivate it instead.`,
        409,
        { orders: usedBy },
      );
    }

    await prisma.rateCard.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  });
}
