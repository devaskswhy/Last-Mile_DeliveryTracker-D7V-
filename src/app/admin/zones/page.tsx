import { PageHeading } from "@/components/ui";
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
    <section className="flex flex-col gap-8">
      <PageHeading eyebrow="Geography" title="Zones">
        <span className="block">
          A zone is the unit rate cards are priced between. Adding one means
          every existing zone needs new inter-zone cards in both directions —
          check the overview for gaps afterwards.
        </span>
      </PageHeading>
      <ZoneManager zones={rows} />
    </section>
  );
}
