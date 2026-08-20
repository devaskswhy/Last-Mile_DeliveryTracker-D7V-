import { PageHeading } from "@/components/ui";
import { prisma } from "@/lib/prisma";

import { AreaManager } from "./AreaManager";

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  const [areas, zones] = await Promise.all([
    prisma.area.findMany({
      orderBy: [{ zone: { code: "asc" } }, { name: "asc" }],
      include: { zone: { select: { id: true, code: true, name: true } } },
    }),
    prisma.zone.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <PageHeading eyebrow="Geography" title="Areas">
        <span className="block">
          Each area maps a pincode to exactly one zone. Pickup and drop
          addresses resolve to a zone through this table, so the same pincode
          may not appear under two different zones — that would make the
          resolution ambiguous and price one address two ways.
        </span>
      </PageHeading>
      <AreaManager areas={areas} zones={zones} />
    </section>
  );
}
