import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** A customer's own orders; an agent sees what is assigned to them. */
export default async function OrdersPage() {
  let user;
  try {
    user = await requireActiveUser();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?next=/orders");
    throw error;
  }

  const scope =
    user.role === "ADMIN"
      ? {}
      : user.role === "AGENT"
        ? { assignedAgent: { userId: user.id } }
        : { customerId: user.id };

  const orders = await prisma.order.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      orderType: true,
      paymentType: true,
      totalCharge: true,
      createdAt: true,
      pickupZone: { select: { code: true } },
      dropZone: { select: { code: true } },
      assignedAgent: { select: { employeeCode: true, user: { select: { name: true } } } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
        <h1 className="text-xl font-semibold">
          {user.role === "AGENT" ? "Assigned to me" : "My orders"}
        </h1>
        {user.role === "CUSTOMER" ? (
          <Link
            href="/orders/new"
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
          >
            New order
          </Link>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              {["Order", "Route", "Type", "Payment", "Status", "Agent", "Total"].map((h) => (
                <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-4">
                  <Link href={`/orders/${order.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {order.pickupZone.code} → {order.dropZone.code}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{order.orderType}</td>
                <td className="py-2 pr-4 font-mono text-xs">{order.paymentType}</td>
                <td className="py-2 pr-4 font-mono text-xs">{order.status}</td>
                <td className="py-2 pr-4">
                  {order.assignedAgent
                    ? `${order.assignedAgent.user.name} (${order.assignedAgent.employeeCode})`
                    : "—"}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{order.totalCharge.toString()}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-gray-500 dark:text-gray-400">
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
