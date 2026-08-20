import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { Button, EmptyRow, Stat, Table, cellClass, rowClass, Tag } from "@/components/ui";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { isClosedStatus } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A customer's own orders; an agent sees what is assigned to them.
 *
 * Every figure comes from the database on each request — there is no mock data
 * anywhere in this page.
 */
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
      pickupCity: true,
      dropCity: true,
      pickupZone: { select: { code: true } },
      dropZone: { select: { code: true } },
      assignedAgent: {
        select: { employeeCode: true, user: { select: { name: true } } },
      },
    },
  });

  const open = orders.filter((order) => !isClosedStatus(order.status));
  const failed = orders.filter((order) => order.status === "FAILED");
  const delivered = orders.filter((order) => order.status === "DELIVERED");

  return (
    <AppShell role={user.role} email={user.email}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-3 text-eyebrow uppercase text-signal">
              {user.role === "AGENT" ? "Assigned to me" : "Your shipments"}
            </p>
            <h1 className="text-headline text-ink-bright">
              {user.role === "AGENT" ? "My deliveries" : "My orders"}
            </h1>
          </div>
          {user.role === "CUSTOMER" ? (
            <Link href="/orders/new">
              <Button>New order</Button>
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Total" value={String(orders.length)} />
          <Stat label="In progress" value={String(open.length)} />
          <Stat label="Delivered" value={String(delivered.length)} />
          <Stat label="Needs a new date" value={String(failed.length)} />
        </div>

        {failed.length > 0 && user.role === "CUSTOMER" ? (
          <p className="rounded-xl border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright">
            {failed.length} delivery attempt(s) failed. Open the order to pick a
            new date.
          </p>
        ) : null}

        <Table
          headers={[
            "Order",
            "Route",
            "Type",
            "Status",
            "Agent",
            "Total",
            "",
          ]}
        >
          {orders.map((order) => (
            <tr key={order.id} className={rowClass}>
              <td className={cellClass}>
                <Link
                  href={`/orders/${order.id}`}
                  className="font-mono text-caption text-ink-bright underline-offset-4 hover:text-signal hover:underline"
                >
                  {order.orderNumber}
                </Link>
                <div className="mt-1 text-[0.6875rem] text-ink-muted">
                  {order.createdAt.toISOString().slice(0, 10)}
                </div>
              </td>
              <td className={cellClass}>
                <span className="font-mono text-caption">
                  {order.pickupZone.code} → {order.dropZone.code}
                </span>
                <div className="mt-1 text-[0.6875rem] text-ink-muted">
                  {order.pickupCity} → {order.dropCity}
                </div>
              </td>
              <td className={cellClass}>
                <Tag>{order.orderType}</Tag>{" "}
                <Tag>{order.paymentType}</Tag>
              </td>
              <td className={cellClass}>
                <Tag active={order.status === "DELIVERED"}>{order.status}</Tag>
              </td>
              <td className={cellClass}>
                {order.assignedAgent ? (
                  <span className="text-caption">
                    {order.assignedAgent.user.name}
                    <span className="ml-1 font-mono text-ink-muted">
                      ({order.assignedAgent.employeeCode})
                    </span>
                  </span>
                ) : (
                  <span className="text-caption text-ink-muted">Unassigned</span>
                )}
              </td>
              <td className={`${cellClass} font-mono`}>
                {order.totalCharge.toString()}
              </td>
              <td className={cellClass}>
                <Link href={`/orders/${order.id}`}>
                  <Button variant="secondary">Track</Button>
                </Link>
              </td>
            </tr>
          ))}
          {orders.length === 0 ? (
            <EmptyRow span={7}>
              {user.role === "AGENT"
                ? "Nothing assigned to you yet."
                : "No orders yet — create your first one."}
            </EmptyRow>
          ) : null}
        </Table>
      </div>
    </AppShell>
  );
}
