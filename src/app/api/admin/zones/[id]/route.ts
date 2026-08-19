import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { zoneUpdateSchema } from "@/lib/validation/zone";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const zone = await prisma.zone.findUnique({
      where: { id: params.id },
      include: { areas: { orderBy: { name: "asc" } } },
    });
    if (!zone) return fail("Zone not found", 404);
    return ok({ zone });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = zoneUpdateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const zone = await prisma.zone.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return ok({ zone });
  });
}

/**
 * Deleting a zone is refused while anything still points at it. The foreign
 * keys are `onDelete: Restrict`, so the database would refuse anyway — this
 * turns that into a message naming what is in the way, since "delete failed"
 * gives an admin nothing to act on.
 *
 * Deactivating (`PATCH { isActive: false }`) is the usual alternative: an
 * inactive zone drops out of rate-card coverage without disturbing the orders
 * that already reference it.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const zone = await prisma.zone.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            areas: true,
            agents: true,
            rateCardsFrom: true,
            rateCardsTo: true,
            pickupOrders: true,
            dropOrders: true,
          },
        },
      },
    });
    if (!zone) return fail("Zone not found", 404);

    const counts = zone._count;
    const rateCards = counts.rateCardsFrom + counts.rateCardsTo;
    const orders = counts.pickupOrders + counts.dropOrders;

    const blockers = [
      counts.areas && `${counts.areas} area(s)`,
      rateCards && `${rateCards} rate card(s)`,
      counts.agents && `${counts.agents} agent(s)`,
      orders && `${orders} order(s)`,
    ].filter(Boolean) as string[];

    if (blockers.length > 0) {
      return fail(
        `Cannot delete this zone while it is referenced by ${blockers.join(", ")}. Reassign them, or deactivate the zone instead.`,
        409,
        { blockers },
      );
    }

    await prisma.zone.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  });
}
