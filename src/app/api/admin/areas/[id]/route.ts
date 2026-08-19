import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { findPincodeZoneConflicts } from "@/lib/admin/config-health";
import { prisma } from "@/lib/prisma";
import { areaUpdateSchema } from "@/lib/validation/area";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const area = await prisma.area.findUnique({
      where: { id: params.id },
      include: { zone: { select: { id: true, code: true, name: true } } },
    });
    if (!area) return fail("Area not found", 404);
    return ok({ area });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = areaUpdateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const existing = await prisma.area.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Area not found", 404);

    // The conflict check runs against the values the row will *have*, not the
    // ones sent, so changing only the zone still re-checks the pincode.
    const pincode = parsed.data.pincode ?? existing.pincode;
    const zoneId = parsed.data.zoneId ?? existing.zoneId;

    if (parsed.data.zoneId) {
      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone) return fail("That zone does not exist", 422);
    }

    const conflicts = await findPincodeZoneConflicts(
      pincode,
      zoneId,
      params.id,
    );
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

    const area = await prisma.area.update({
      where: { id: params.id },
      data: parsed.data,
      include: { zone: { select: { id: true, code: true, name: true } } },
    });

    return ok({ area });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    await prisma.area.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  });
}
