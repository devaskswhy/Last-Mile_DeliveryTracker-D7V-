import Link from "next/link";

import { getConfigHealth } from "@/lib/admin/config-health";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

/**
 * Configuration overview. The point of this page is the gap list: a rate table
 * can look complete row by row and still be unable to price an order, because
 * what is wrong is what is absent.
 */
export default async function AdminOverviewPage() {
  const health = await getConfigHealth();

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active zones" value={String(health.zones.active)} />
        <Stat
          label="Rate cards usable"
          value={`${health.rateCards.usable} / ${health.rateCards.required}`}
        />
        <Stat
          label="COD rules"
          value={`${health.codSurcharges.configured.length} / 2`}
        />
      </div>

      {health.ok ? (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Configuration is complete — every active zone pair can be priced for
          both order types.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {health.zones.active === 0 ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No active zones. Start at{" "}
              <Link href="/admin/zones" className="underline">
                Zones
              </Link>
              .
            </p>
          ) : null}

          {health.rateCards.gaps.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium">
                {health.rateCards.gaps.length} rate-card gap(s)
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                An order matching one of these has no price.{" "}
                <Link href="/admin/rate-cards" className="underline">
                  Fill them in
                </Link>
                .
              </p>
              <ul className="mt-2 max-h-56 overflow-y-auto font-mono text-xs text-gray-700 dark:text-gray-300">
                {health.rateCards.gaps.map((gap) => (
                  <li
                    key={`${gap.orderType}-${gap.fromZone.id}-${gap.toZone.id}`}
                  >
                    {gap.orderType} · {gap.scope} · {gap.fromZone.code} →{" "}
                    {gap.toZone.code}
                    {gap.reason === "inactive" ? " (inactive)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {health.codSurcharges.missing.length > 0 ? (
            <p className="text-sm">
              No COD surcharge rule for{" "}
              <span className="font-mono">
                {health.codSurcharges.missing.join(", ")}
              </span>
              .{" "}
              <Link href="/admin/cod-surcharges" className="underline">
                Configure
              </Link>
              .
            </p>
          ) : null}

          {health.pincodeConflicts.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                {health.pincodeConflicts.length} ambiguous pincode(s)
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                These resolve to more than one zone, so an address using them
                would price inconsistently.
              </p>
              <ul className="mt-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                {health.pincodeConflicts.map((conflict) => (
                  <li key={conflict.pincode}>
                    {conflict.pincode} →{" "}
                    {conflict.zones.map((z) => z.code).join(" / ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
