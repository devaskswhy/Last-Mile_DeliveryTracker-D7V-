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
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Areas</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Each area maps a pincode to exactly one zone. Pickup and drop
          addresses resolve to a zone through this table, so the same pincode
          may not appear under two different zones — that would make the
          resolution ambiguous and price one address two ways.
        </p>
      </div>
      <AreaManager areas={areas} zones={zones} />
    </section>
  );
}
