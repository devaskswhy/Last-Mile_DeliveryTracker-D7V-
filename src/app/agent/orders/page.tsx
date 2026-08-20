import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { Panel, Stat, Tag } from "@/components/ui";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";
import { nextActionsFor } from "@/lib/orders/tracking";
import { prisma } from "@/lib/prisma";

import { AgentOrderActions, type AgentOrderRow } from "./AgentOrderActions";
import { AvailabilityToggle } from "./AvailabilityToggle";

export const dynamic = "force-dynamic";

/**
 * The agent's own workload.
 *
 * Scoped by `assignedAgent.userId` from the re-read session, which is the same
 * rule the status API enforces on write — an agent sees exactly the work they
 * are allowed to act on.
 */
export default async function AgentOrdersPage({
  searchParams,
}: {
  searchParams?: { all?: string };
}) {
  let user;
  try {
    user = await requireActiveUser("AGENT", "ADMIN");
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.status === 401 ? "/login?next=/agent/orders" : "/forbidden");
    }
    throw error;
  }

  const showAll = searchParams?.all === "true";

  const [orders, profile] = await Promise.all([
    prisma.order.findMany({
      where: {
        assignedAgent: { userId: user.id },
        ...(showAll ? {} : { status: { in: [...ACTIVE_ORDER_STATUSES] } }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        pickupCity: true,
        pickupPincode: true,
        pickupAddressLine1: true,
        dropCity: true,
        dropPincode: true,
        dropAddressLine1: true,
        dropContactName: true,
        dropPhone: true,
        paymentType: true,
        codAmount: true,
        totalCharge: true,
      },
    }),
    prisma.agent.findUnique({
      where: { userId: user.id },
      select: {
        employeeCode: true,
        availability: true,
        currentZone: { select: { code: true } },
        _count: {
          select: {
            orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
          },
        },
      },
    }),
  ]);

  const rows: AgentOrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    pickupCity: order.pickupCity,
    pickupPincode: order.pickupPincode,
    pickupAddressLine1: order.pickupAddressLine1,
    dropCity: order.dropCity,
    dropPincode: order.dropPincode,
    dropAddressLine1: order.dropAddressLine1,
    dropContactName: order.dropContactName,
    dropPhone: order.dropPhone,
    paymentType: order.paymentType,
    codAmount: order.codAmount?.toString() ?? null,
    totalCharge: order.totalCharge.toString(),
    nextStatuses: nextActionsFor(order.status),
  }));

  const codTotal = rows
    .filter((row) => row.paymentType === "COD" && row.codAmount)
    .reduce((sum, row) => sum + Number(row.codAmount), 0);

  return (
    <AppShell role={user.role} email={user.email}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-3 text-eyebrow uppercase text-signal">
              {user.name}
            </p>
            <h1 className="text-headline text-ink-bright">My deliveries</h1>
          </div>
          <Link
            href={showAll ? "/agent/orders" : "/agent/orders?all=true"}
            className="text-caption text-ink-muted underline-offset-4 hover:text-signal hover:underline"
          >
            {showAll ? "Show open only" : "Show all"}
          </Link>
        </div>

        {profile ? (
          <AvailabilityToggle
            initial={profile.availability}
            activeOrderCount={profile._count.orders}
            zoneCode={profile.currentZone?.code ?? null}
            employeeCode={profile.employeeCode}
          />
        ) : (
          <Panel>
            <p className="text-caption text-ink-muted">
              This account has no agent profile, so there is no availability to
              set. Signed in as {user.role}.
            </p>
          </Panel>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat label="Shown" value={String(rows.length)} />
          <Stat
            label="COD to collect"
            value={codTotal > 0 ? codTotal.toFixed(2) : "—"}
          />
          <Stat
            label="Next up"
            value={rows[0]?.status ?? "—"}
          />
        </div>

        <div className="flex flex-col gap-4">
          {rows.map((order) => (
            <Panel key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono text-caption text-ink-bright underline-offset-4 hover:text-signal hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="mt-2 text-body text-ink-bright">
                    {order.dropContactName}
                    <span className="ml-2 font-mono text-caption text-ink-muted">
                      {order.dropPhone}
                    </span>
                  </p>
                  <p className="mt-1 text-caption text-ink-muted">
                    {order.dropAddressLine1}, {order.dropCity}{" "}
                    {order.dropPincode}
                  </p>
                  <p className="mt-1 text-[0.6875rem] text-ink-muted/70">
                    from {order.pickupAddressLine1}, {order.pickupCity}{" "}
                    {order.pickupPincode}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Tag active={order.status === "OUT_FOR_DELIVERY"}>
                    {order.status}
                  </Tag>
                  {order.paymentType === "COD" && order.codAmount ? (
                    <span className="rounded-full bg-signal px-2.5 py-1 font-mono text-[0.6875rem] text-ink">
                      collect {order.codAmount}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 border-t border-ink-line pt-4">
                <AgentOrderActions order={order} />
              </div>
            </Panel>
          ))}

          {rows.length === 0 ? (
            <Panel>
              <p className="text-body text-ink-muted">
                {showAll
                  ? "Nothing assigned to you yet."
                  : "No open deliveries. Anything finished is under “Show all”."}
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
