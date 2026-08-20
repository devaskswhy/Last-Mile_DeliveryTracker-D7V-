import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";
import { nextActionsFor } from "@/lib/orders/tracking";
import { prisma } from "@/lib/prisma";

import { AgentOrderActions, type AgentOrderRow } from "./AgentOrderActions";

export const dynamic = "force-dynamic";

/**
 * The agent's own workload.
 *
 * The query is scoped by `assignedAgent.userId` from the re-read session, so an
 * agent only ever sees work that is theirs — the same rule the status API
 * enforces on write.
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

  const orders = await prisma.order.findMany({
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
      dropCity: true,
      dropPincode: true,
      paymentType: true,
      codAmount: true,
      totalCharge: true,
    },
  });

  const rows: AgentOrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    pickupCity: order.pickupCity,
    pickupPincode: order.pickupPincode,
    dropCity: order.dropCity,
    dropPincode: order.dropPincode,
    paymentType: order.paymentType,
    codAmount: order.codAmount?.toString() ?? null,
    totalCharge: order.totalCharge.toString(),
    nextStatuses: nextActionsFor(order.status),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
        <div>
          <h1 className="text-xl font-semibold">My deliveries</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {user.name} — {showAll ? "all orders" : "open work"}
          </p>
        </div>
        <Link
          href={showAll ? "/agent/orders" : "/agent/orders?all=true"}
          className="text-sm text-gray-600 underline-offset-4 hover:underline dark:text-gray-400"
        >
          {showAll ? "Show open only" : "Show all"}
        </Link>
      </header>

      <div className="flex flex-col gap-4">
        {rows.map((order) => (
          <article
            key={order.id}
            className="rounded border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/orders/${order.id}`} className="font-mono text-sm underline-offset-4 hover:underline">
                {order.orderNumber}
              </Link>
              <span className="font-mono text-xs">{order.status}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {order.pickupCity} {order.pickupPincode} → {order.dropCity}{" "}
              {order.dropPincode}
            </p>
            {order.paymentType === "COD" && order.codAmount ? (
              <p className="mt-1 text-sm font-medium">
                Collect {order.codAmount} on delivery
              </p>
            ) : null}
            <div className="mt-3">
              <AgentOrderActions order={order} />
            </div>
          </article>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {showAll ? "Nothing assigned to you yet." : "No open deliveries."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
