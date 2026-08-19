import { prisma } from "@/lib/prisma";

import { CodSurchargeManager, type SurchargeRow } from "./CodSurchargeManager";

export const dynamic = "force-dynamic";

export default async function CodSurchargesPage() {
  const configs = await prisma.codSurchargeConfig.findMany({
    orderBy: { orderType: "asc" },
  });

  const rows: SurchargeRow[] = configs.map((c) => ({
    orderType: c.orderType,
    mode: c.mode,
    amount: c.amount?.toString() ?? null,
    percentage: c.percentage?.toString() ?? null,
    minAmount: c.minAmount?.toString() ?? null,
    isActive: c.isActive,
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">COD surcharges</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          One rule per order type, applied on top of freight when an order is
          paid cash on delivery. A flat amount, or a percentage of the freight
          charge with an optional floor.
        </p>
      </div>
      <CodSurchargeManager surcharges={rows} />
    </section>
  );
}
