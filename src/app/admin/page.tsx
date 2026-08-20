import Link from "next/link";

import { PageHeading, Panel, Stat } from "@/components/ui";
import { getConfigHealth } from "@/lib/admin/config-health";

export const dynamic = "force-dynamic";

/**
 * Configuration overview. The point of this page is the gap list: a rate table
 * can look complete row by row and still be unable to price an order, because
 * what is wrong is what is absent.
 */
export default async function AdminOverviewPage() {
  const health = await getConfigHealth();

  return (
    <section className="flex flex-col gap-8">
      <PageHeading eyebrow="Configuration" title="Overview">
        A rate table can look complete row by row and still be unable to price
        an order, because what is wrong is what is absent.
      </PageHeading>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
        <p className="rounded border border-ink-line bg-ink-soft px-4 py-3 text-caption text-ink-bright">
          Configuration is complete — every active zone pair can be priced for
          both order types.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {health.zones.active === 0 ? (
            <p className="rounded border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright">
              No active zones. Start at{" "}
              <Link href="/admin/zones" className="text-signal underline underline-offset-4">
                Zones
              </Link>
              .
            </p>
          ) : null}

          {health.rateCards.gaps.length > 0 ? (
            <Panel>
              <h3 className="text-caption font-medium text-ink-bright">
                {health.rateCards.gaps.length} rate-card gap(s)
              </h3>
              <p className="mt-1 text-caption text-ink-muted">
                An order matching one of these has no price.{" "}
                <Link href="/admin/rate-cards" className="text-signal underline underline-offset-4">
                  Fill them in
                </Link>
                .
              </p>
              <ul className="mt-2 max-h-56 overflow-y-auto font-mono text-caption text-ink-bright">
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
            </Panel>
          ) : null}

          {health.codSurcharges.missing.length > 0 ? (
            <p className="text-caption">
              No COD surcharge rule for{" "}
              <span className="font-mono">
                {health.codSurcharges.missing.join(", ")}
              </span>
              .{" "}
              <Link href="/admin/cod-surcharges" className="text-signal underline underline-offset-4">
                Configure
              </Link>
              .
            </p>
          ) : null}

          {health.pincodeConflicts.length > 0 ? (
            <Panel>
              <h3 className="text-caption font-medium text-signal">
                {health.pincodeConflicts.length} ambiguous pincode(s)
              </h3>
              <p className="mt-1 text-caption text-ink-muted">
                These resolve to more than one zone, so an address using them
                would price inconsistently.
              </p>
              <ul className="mt-2 font-mono text-caption text-ink-bright">
                {health.pincodeConflicts.map((conflict) => (
                  <li key={conflict.pincode}>
                    {conflict.pincode} →{" "}
                    {conflict.zones.map((z) => z.code).join(" / ")}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
    </section>
  );
}
