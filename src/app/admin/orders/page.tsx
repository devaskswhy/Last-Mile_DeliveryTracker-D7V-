import Link from "next/link";

import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/enums";
import { ACTIVE_ORDER_STATUSES, isClosedStatus } from "@/lib/domain/order-status";
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Orders</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Filter by status, zone or agent. Any status can be overridden — the
            reason is recorded in the order&rsquo;s history.
          </p>
        </div>
        <Link
          href="/admin/orders/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
        >
          New order for a customer
        </Link>
      </div>

      {/* A GET form so every filtered view is a shareable, bookmarkable URL. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Any</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">Zone</span>
          <select
            name="zone"
            defaultValue={filters.zone ?? ""}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Any</option>
            {zones.map((zone) => (
              <option key={zone.code} value={zone.code}>
                {zone.code} — {zone.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">Agent</span>
          <select
            name="agent"
            defaultValue={filters.agent ?? ""}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
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
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
        >
          Apply
        </button>
        {isFiltered ? (
          <Link
            href="/admin/orders"
            className="px-2 py-1.5 text-sm text-gray-600 underline-offset-4 hover:underline dark:text-gray-400"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-3">
        {unassigned.length > 0 ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {unassigned.length} waiting for an agent
          </p>
        ) : null}
        {failed.length > 0 ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {failed.length} failed — awaiting a reschedule from the customer
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              {["Order", "Customer", "Route", "Status", "Agent", "Total", "Actions"].map(
                (header) => (
                  <th key={header} className="py-2 pr-4 font-medium whitespace-nowrap">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-gray-100 align-top dark:border-gray-800"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  {order._count.attempts > 1 ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {order._count.attempts} attempts
                    </div>
                  ) : null}
                </td>
                <td className="py-3 pr-4">{order.customer.name}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {order.pickupZone.code} → {order.dropZone.code}
                </td>
                <td className="py-3 pr-4 font-mono text-xs">{order.status}</td>
                <td className="py-3 pr-4">
                  {order.assignedAgent ? (
                    <span>
                      {order.assignedAgent.user.name}{" "}
                      <span className="font-mono text-xs text-gray-500">
                        ({order.assignedAgent.employeeCode})
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">Unassigned</span>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {order.totalCharge.toString()}
                </td>
                <td className="py-3 pr-4">
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
              <tr>
                <td colSpan={7} className="py-4 text-gray-500 dark:text-gray-400">
                  {isFiltered ? "No orders match these filters." : "No orders yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
