import { prisma } from "@/lib/prisma";

import { ZoneManager, type ZoneRow } from "./ZoneManager";

export const dynamic = "force-dynamic";

export default async function ZonesPage() {
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

  const rows: ZoneRow[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    code: zone.code,
    isActive: zone.isActive,
    dependents: {
      areas: zone._count.areas,
      rateCards: zone._count.rateCardsFrom + zone._count.rateCardsTo,
      agents: zone._count.agents,
      orders: zone._count.pickupOrders + zone._count.dropOrders,
    },
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Zones</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          A zone is the unit rate cards are priced between. Adding one means
          every existing zone needs new inter-zone cards in both directions —
          check the overview for gaps afterwards.
        </p>
      </div>
      <ZoneManager zones={rows} />
    </section>
  );
}
