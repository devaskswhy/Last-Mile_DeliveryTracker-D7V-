import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { findPincodeZoneConflicts } from "@/lib/admin/config-health";
import { prisma } from "@/lib/prisma";
import { areaCreateSchema } from "@/lib/validation/area";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return adminRoute(async () => {
    const zoneId = new URL(request.url).searchParams.get("zoneId");

    const areas = await prisma.area.findMany({
      where: zoneId ? { zoneId } : undefined,
      orderBy: [{ zone: { code: "asc" } }, { name: "asc" }],
      include: { zone: { select: { id: true, code: true, name: true } } },
    });

    return ok({ areas });
  });
}

/**
 * Creating an area is refused when its pincode already belongs to a different
 * zone. Pickup and drop addresses will resolve to a zone through this table, so
 * one pincode mapping to two zones makes that resolution depend on row order —
 * the same address would price differently from one request to the next.
 */
export async function POST(request: Request) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = areaCreateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const { name, pincode, zoneId, isActive } = parsed.data;

    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) return fail("That zone does not exist", 422);

    const conflicts = await findPincodeZoneConflicts(pincode, zoneId);
    if (conflicts.length > 0) {
      const where = conflicts
        .map((c) => `${c.name} (${c.zone.code})`)
        .join(", ");
      return fail(
        `Pincode ${pincode} is already mapped to a different zone by ${where}. A pincode must resolve to exactly one zone.`,
        409,
        { conflicts },
      );
    }

    const area = await prisma.area.create({
      data: { name, pincode, zoneId, isActive },
      include: { zone: { select: { id: true, code: true, name: true } } },
    });

    return ok({ area }, 201);
  });
}
