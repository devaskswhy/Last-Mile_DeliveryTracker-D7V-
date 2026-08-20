import Link from "next/link";

import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/enums";
import { ACTIVE_ORDER_STATUSES, isClosedStatus } from "@/lib/domain/order-status";
import {
  EmptyRow,
  PageHeading,
  Table,
  Tag,
  cellClass,
  rowClass,
} from "@/components/ui";
import { prisma } from "@/lib/prisma";

import { AssignmentControls, type AgentOption } from "./AssignmentControls";
import { StatusOverride } from "./StatusOverride";

export const dynamic = "force-dynamic";

interface Filters {
  status?: string;
  zone?: string;
  agent?: string;
}

/** Only values that exist are applied, so a stale bookmark cannot 500 the page. */
function buildWhere(filters: Filters, validStatus: boolean) {
  return {
    ...(validStatus ? { status: filters.status as OrderStatus } : {}),
    ...(filters.zone
      ? {
          OR: [
            { pickupZone: { code: filters.zone } },
            { dropZone: { code: filters.zone } },
          ],
        }
      : {}),
    ...(filters.agent
      ? filters.agent === "UNASSIGNED"
        ? { assignedAgentId: null }
        : { assignedAgentId: filters.agent }
      : {}),
  };
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Filters;
}) {
  const filters: Filters = {
    status: searchParams?.status || undefined,
    zone: searchParams?.zone || undefined,
    agent: searchParams?.agent || undefined,
  };

  const validStatus =
    !!filters.status &&
    (ORDER_STATUSES as readonly string[]).includes(filters.status);

  const [orders, agents, zones] = await Promise.all([
    prisma.order.findMany({
      where: buildWhere(filters, validStatus),
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalCharge: true,
        createdAt: true,
        pickupZone: { select: { code: true } },
        dropZone: { select: { code: true } },
        customer: { select: { name: true } },
        assignedAgent: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { name: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
    }),
    prisma.agent.findMany({
      orderBy: { employeeCode: "asc" },
      select: {
        id: true,
        employeeCode: true,
        availability: true,
        currentZone: { select: { code: true } },
        user: { select: { name: true, isActive: true } },
        _count: {
          select: {
            orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
          },
        },
      },
    }),
    prisma.zone.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  const agentOptions: AgentOption[] = agents.map((agent) => ({
    id: agent.id,
    employeeCode: agent.employeeCode,
    name: agent.user.name,
    availability: agent.availability,
    zoneCode: agent.currentZone?.code ?? null,
    activeOrderCount: agent._count.orders,
    isActive: agent.user.isActive,
  }));

  const unassigned = orders.filter(
    (order) => !order.assignedAgent && !isClosedStatus(order.status),
  );
  const failed = orders.filter((order) => order.status === "FAILED");
  const isFiltered = validStatus || !!filters.zone || !!filters.agent;

  return (
    <section className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Orders"
        action={
          <Link
            href="/admin/orders/new"
            className="rounded-full bg-signal px-4 py-2 text-caption font-medium text-ink transition-transform duration-fast ease-signature hover:scale-[1.03]"
          >
            New order
          </Link>
        }
      >
        Filter by status, zone or agent. Any status can be overridden — the
        reason is recorded in the order&rsquo;s history.
      </PageHeading>

      {/* A GET form so every filtered view is a shareable, bookmarkable URL. */}
      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-ink-line bg-ink-soft p-5 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto] lg:items-end"
      >
        <label className="flex min-w-0 flex-col gap-2 text-caption">
          <span className="text-eyebrow uppercase text-ink-muted">Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className="w-full min-w-0 rounded-xl border border-ink-line bg-ink px-3 py-2.5 text-caption text-ink-bright outline-none transition-colors duration-fast ease-signature focus:border-signal"
          >
            <option value="">Any</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-2 text-caption">
          <span className="text-eyebrow uppercase text-ink-muted">Zone</span>
          <select
            name="zone"
            defaultValue={filters.zone ?? ""}
            className="w-full min-w-0 rounded-xl border border-ink-line bg-ink px-3 py-2.5 text-caption text-ink-bright outline-none transition-colors duration-fast ease-signature focus:border-signal"
          >
            <option value="">Any</option>
            {zones.map((zone) => (
              <option key={zone.code} value={zone.code}>
                {zone.code} — {zone.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-2 text-caption">
          <span className="text-eyebrow uppercase text-ink-muted">Agent</span>
          <select
            name="agent"
            defaultValue={filters.agent ?? ""}
            className="w-full min-w-0 rounded-xl border border-ink-line bg-ink px-3 py-2.5 text-caption text-ink-bright outline-none transition-colors duration-fast ease-signature focus:border-signal"
          >
            <option value="">Any</option>
            <option value="UNASSIGNED">Unassigned</option>
            {agentOptions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.employeeCode} — {agent.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-fit rounded-full bg-signal px-5 py-2.5 text-caption font-medium text-ink transition-transform duration-fast ease-signature hover:scale-[1.03]"
        >
          Apply
        </button>
        {isFiltered ? (
          <Link
            href="/admin/orders"
            className="px-2 py-1.5 text-caption text-ink-muted underline-offset-4 hover:text-signal hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-3">
        {unassigned.length > 0 ? (
          <p className="rounded border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright">
            {unassigned.length} waiting for an agent
          </p>
        ) : null}
        {failed.length > 0 ? (
          <p className="rounded border border-signal bg-signal-wash px-4 py-3 text-caption text-ink-bright">
            {failed.length} failed — awaiting a reschedule from the customer
          </p>
        ) : null}
      </div>

      <Table
        headers={[
          "Order",
          "Customer",
          "Route",
          "Status",
          "Agent",
          "Total",
          "Actions",
        ]}
      >
            {orders.map((order) => (
              <tr
                key={order.id}
                className={rowClass}
              >
                <td className={cellClass}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono text-caption underline-offset-4 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  {order._count.attempts > 1 ? (
                    <div className="text-[0.6875rem] text-ink-muted">
                      {order._count.attempts} attempts
                    </div>
                  ) : null}
                </td>
                <td className={cellClass}>{order.customer.name}</td>
                <td className="py-3 pr-4 font-mono text-caption">
                  {order.pickupZone.code} → {order.dropZone.code}
                </td>
                <td className="py-3 pr-4 font-mono text-caption">{order.status}</td>
                <td className={cellClass}>
                  {order.assignedAgent ? (
                    <span>
                      {order.assignedAgent.user.name}{" "}
                      <span className="font-mono text-caption text-ink-muted">
                        ({order.assignedAgent.employeeCode})
                      </span>
                    </span>
                  ) : (
                    <span className="text-signal">Unassigned</span>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-caption">
                  {order.totalCharge.toString()}
                </td>
                <td className={cellClass}>
                  <div className="flex flex-col gap-2">
                    <AssignmentControls
                      order={{
                        id: order.id,
                        orderNumber: order.orderNumber,
                        status: order.status,
                        pickupZoneCode: order.pickupZone.code,
                        dropZoneCode: order.dropZone.code,
                        customerName: order.customer.name,
                        totalCharge: order.totalCharge.toString(),
                        assignedAgent: order.assignedAgent
                          ? {
                              id: order.assignedAgent.id,
                              name: order.assignedAgent.user.name,
                              employeeCode: order.assignedAgent.employeeCode,
                            }
                          : null,
                        isTerminal: isClosedStatus(order.status),
                      }}
                      agents={agentOptions}
                    />
                    <StatusOverride
                      orderId={order.id}
                      currentStatus={order.status}
                    />
                  </div>
                </td>
              </tr>
            ))}
        {orders.length === 0 ? (
          <EmptyRow span={7}>
            {isFiltered ? "No orders match these filters." : "No orders yet."}
          </EmptyRow>
        ) : null}
      </Table>
    </section>
  );
}
