import { ok } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { getConfigHealth } from "@/lib/admin/config-health";

export const dynamic = "force-dynamic";

/**
 * Whether the configuration can serve a rate lookup: which zone pairs have no
 * usable rate card, which order types have no COD rule, and which pincodes
 * resolve to more than one zone.
 */
export async function GET() {
  return adminRoute(async () => ok({ health: await getConfigHealth() }));
}
