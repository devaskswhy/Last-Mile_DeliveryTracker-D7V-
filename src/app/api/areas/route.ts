import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

// Reads the session cookie, so it must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * The serviceable pincodes, for the order form's pickup/drop pickers.
 *
 * Zones and areas are admin-configurable data (CLAUDE.md's non-negotiable
 * rule 3), not something the frontend may hardcode — an admin can add or
 * retire an area at any time through the live CRUD at `/admin/areas`, and a
 * baked-in list would silently drift from what actually resolves to a price.
 * This is the one read that lets the order form offer a picker instead of a
 * freeform pincode field without embedding zone data in application code.
 */
export async function GET() {
  try {
    await requireActiveUser();

    const areas = await prisma.area.findMany({
      where: { isActive: true, zone: { isActive: true } },
      select: {
        pincode: true,
        name: true,
        zone: { select: { code: true, name: true } },
      },
      orderBy: [{ zone: { code: "asc" } }, { pincode: "asc" }],
    });

    return ok({
      areas: areas.map((a) => ({
        pincode: a.pincode,
        areaName: a.name,
        zoneCode: a.zone.code,
        zoneName: a.zone.name,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[api/areas]", error);
    return fail("Could not load serviceable areas", 500);
  }
}
