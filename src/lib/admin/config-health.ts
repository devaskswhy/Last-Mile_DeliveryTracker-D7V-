import { ORDER_TYPES, deriveScope, type OrderType, type RateScope } from "@/lib/domain/enums";
import { prisma } from "@/lib/prisma";

/**
 * Reports on whether the configuration in the database can actually serve a
 * rate lookup.
 *
 * Zod can reject a bad row as it is written, but it cannot see an absence. The
 * failure this guards against is a *gap*: an admin adds a third zone and the
 * table quietly needs ten more rate cards, so the first order between the new
 * zone and an old one has no price and cannot be quoted. Nothing about that is
 * visible from any single row, which is why it is computed across the whole
 * table here and surfaced in the admin UI.
 *
 * Everything is read from the database. No zone, rate or surcharge value is
 * referenced from application code.
 */

export interface ZoneRef {
  id: string;
  code: string;
  name: string;
}

export interface CoverageGap {
  orderType: OrderType;
  scope: RateScope;
  fromZone: ZoneRef;
  toZone: ZoneRef;
  /** `missing` = no row at all; `inactive` = a row exists but is switched off. */
  reason: "missing" | "inactive";
}

export interface PincodeConflict {
  pincode: string;
  zones: Array<ZoneRef & { areas: string[] }>;
}

export interface ConfigHealth {
  zones: { total: number; active: number };
  rateCards: {
    required: number;
    usable: number;
    gaps: CoverageGap[];
  };
  codSurcharges: {
    configured: OrderType[];
    missing: OrderType[];
  };
  pincodeConflicts: PincodeConflict[];
  /** True when a rate lookup can be served for every active zone pair. */
  ok: boolean;
}

const key = (orderType: string, fromZoneId: string, toZoneId: string) =>
  `${orderType}::${fromZoneId}::${toZoneId}`;

export async function getConfigHealth(): Promise<ConfigHealth> {
  const [zones, activeZones, rateCards, surcharges, areas] = await Promise.all([
    prisma.zone.count(),
    prisma.zone.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.rateCard.findMany({
      select: {
        orderType: true,
        fromZoneId: true,
        toZoneId: true,
        isActive: true,
      },
    }),
    prisma.codSurchargeConfig.findMany({
      where: { isActive: true },
      select: { orderType: true },
    }),
    prisma.area.findMany({
      where: { isActive: true },
      select: {
        name: true,
        pincode: true,
        zone: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  // --- Rate-card coverage --------------------------------------------------
  const byKey = new Map<string, boolean>();
  for (const card of rateCards) {
    const k = key(card.orderType, card.fromZoneId, card.toZoneId);
    // A usable card wins over an unusable one if both somehow exist.
    byKey.set(k, (byKey.get(k) ?? false) || card.isActive);
  }

  const gaps: CoverageGap[] = [];
  let usable = 0;

  for (const orderType of ORDER_TYPES) {
    for (const from of activeZones) {
      for (const to of activeZones) {
        const k = key(orderType, from.id, to.id);
        const state = byKey.get(k);

        if (state === true) {
          usable += 1;
          continue;
        }
        gaps.push({
          orderType,
          scope: deriveScope(from.id, to.id),
          fromZone: from,
          toZone: to,
          reason: state === false ? "inactive" : "missing",
        });
      }
    }
  }

  const required = ORDER_TYPES.length * activeZones.length * activeZones.length;

  // --- COD surcharge coverage ---------------------------------------------
  const configured = surcharges.map((s) => s.orderType);
  const missingSurcharges = ORDER_TYPES.filter(
    (type) => !configured.includes(type),
  );

  // --- Pincode ambiguity ---------------------------------------------------
  // A pincode appearing in two different zones makes zone detection
  // non-deterministic: the same address would price differently depending on
  // which area row happened to be read first. Two areas sharing a pincode
  // inside one zone is fine, so only cross-zone collisions are reported.
  const byPincode = new Map<
    string,
    Map<string, { zone: ZoneRef; areas: string[] }>
  >();

  for (const area of areas) {
    const zoneMap = byPincode.get(area.pincode) ?? new Map();
    const entry = zoneMap.get(area.zone.id) ?? { zone: area.zone, areas: [] };
    entry.areas.push(area.name);
    zoneMap.set(area.zone.id, entry);
    byPincode.set(area.pincode, zoneMap);
  }

  const pincodeConflicts: PincodeConflict[] = [];
  for (const [pincode, zoneMap] of byPincode) {
    if (zoneMap.size > 1) {
      pincodeConflicts.push({
        pincode,
        zones: [...zoneMap.values()].map((e) => ({ ...e.zone, areas: e.areas })),
      });
    }
  }

  return {
    zones: { total: zones, active: activeZones.length },
    rateCards: { required, usable, gaps },
    codSurcharges: { configured, missing: missingSurcharges },
    pincodeConflicts,
    ok:
      gaps.length === 0 &&
      missingSurcharges.length === 0 &&
      pincodeConflicts.length === 0 &&
      activeZones.length > 0,
  };
}

/**
 * Areas in a *different* zone that already claim this pincode. Used to reject
 * an area write before it makes zone detection ambiguous, rather than letting
 * the health report discover it afterwards.
 */
export async function findPincodeZoneConflicts(
  pincode: string,
  zoneId: string,
  excludeAreaId?: string,
) {
  return prisma.area.findMany({
    where: {
      pincode,
      zoneId: { not: zoneId },
      isActive: true,
      ...(excludeAreaId ? { id: { not: excludeAreaId } } : {}),
    },
    select: {
      id: true,
      name: true,
      zone: { select: { id: true, code: true, name: true } },
    },
  });
}
