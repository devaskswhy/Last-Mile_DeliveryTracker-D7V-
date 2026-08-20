import { getConfigHealth } from "@/lib/admin/config-health";
import { PageHeading } from "@/components/ui";
import { prisma } from "@/lib/prisma";

import { RateCardManager, type RateCardRow } from "./RateCardManager";

export const dynamic = "force-dynamic";

export default async function RateCardsPage() {
  const [cards, zones, health] = await Promise.all([
    prisma.rateCard.findMany({
      orderBy: [
        { orderType: "asc" },
        { scope: "asc" },
        { fromZone: { code: "asc" } },
        { toZone: { code: "asc" } },
      ],
      include: {
        fromZone: { select: { id: true, code: true } },
        toZone: { select: { id: true, code: true } },
      },
    }),
    prisma.zone.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getConfigHealth(),
  ]);

  // Decimals are serialised to strings before crossing into the client
  // component: they are not JSON-serialisable as-is, and rendering money
  // through a float would reintroduce the rounding the column avoids.
  const rows: RateCardRow[] = cards.map((card) => ({
    id: card.id,
    orderType: card.orderType,
    scope: card.scope,
    baseRate: card.baseRate.toString(),
    baseWeightKg: card.baseWeightKg.toString(),
    perKgRate: card.perKgRate.toString(),
    isActive: card.isActive,
    fromZone: card.fromZone,
    toZone: card.toZone,
  }));

  return (
    <section className="flex flex-col gap-8">
      <PageHeading eyebrow="Pricing" title="Rate cards">
        <span className="block">
          One card per order type and zone pair. Scope is not a choice — a card
          within one zone is INTRA, one between two zones is INTER — so an
          N-zone grid needs 2 × N² cards in total.
        </span>
      </PageHeading>
      <RateCardManager rateCards={rows} zones={zones} gaps={health.rateCards.gaps} />
    </section>
  );
}
