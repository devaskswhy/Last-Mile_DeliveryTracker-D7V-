import { ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { zoneCreateSchema } from "@/lib/validation/zone";

export const dynamic = "force-dynamic";

/** Zones, with the dependent counts the UI needs to explain a blocked delete. */
export async function GET() {
  return adminRoute(async () => {
    const zones = await prisma.zone.findMany({
      orderBy: { code: "asc" },
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

    return ok({ zones });
  });
}

export async function POST(request: Request) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = zoneCreateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const zone = await prisma.zone.create({ data: parsed.data });
    return ok({ zone }, 201);
  });
}
