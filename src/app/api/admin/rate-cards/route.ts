import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { serializeDecimals } from "@/lib/serialize";
import { rateCardCreateSchema } from "@/lib/validation/rate-card";

export const dynamic = "force-dynamic";

const DECIMAL_FIELDS = ["baseRate", "baseWeightKg", "perKgRate"] as const;

const zoneSelect = { select: { id: true, code: true, name: true } };

export async function GET(request: Request) {
  return adminRoute(async () => {
    const params = new URL(request.url).searchParams;
    const orderType = params.get("orderType");
    const scope = params.get("scope");

    const cards = await prisma.rateCard.findMany({
      where: {
        ...(orderType === "B2B" || orderType === "B2C" ? { orderType } : {}),
        ...(scope === "INTRA" || scope === "INTER" ? { scope } : {}),
      },
      orderBy: [
        { orderType: "asc" },
        { scope: "asc" },
        { fromZone: { code: "asc" } },
        { toZone: { code: "asc" } },
      ],
      include: { fromZone: zoneSelect, toZone: zoneSelect },
    });

    return ok({
      rateCards: cards.map((c) => serializeDecimals(c, DECIMAL_FIELDS)),
    });
  });
}

export async function POST(request: Request) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = rateCardCreateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const data = parsed.data;

    const zones = await prisma.zone.findMany({
      where: { id: { in: [data.fromZoneId, data.toZoneId] } },
      select: { id: true },
    });
    const known = new Set(zones.map((z) => z.id));
    if (!known.has(data.fromZoneId) || !known.has(data.toZoneId)) {
      return fail("One or both of those zones do not exist", 422);
    }

    const card = await prisma.rateCard.create({
      data,
      include: { fromZone: zoneSelect, toZone: zoneSelect },
    });

    return ok({ rateCard: serializeDecimals(card, DECIMAL_FIELDS) }, 201);
  });
}
