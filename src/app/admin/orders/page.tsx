import Link from "next/link";

import { ACTIVE_ORDER_STATUSES, isTerminalStatus } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";

import { AssignmentControls, type AgentOption } from "./AssignmentControls";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const [orders, agents] = await Promise.all([
    prisma.order.findMany({
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
    (order) => !order.assignedAgent && !isTerminalStatus(order.status),
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Orders</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Auto-assignment runs at creation. Anything it could not place is
            listed below for manual assignment or a retry.
          </p>
        </div>
        <Link
          href="/admin/orders/new"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
        >
          New order for a customer
        </Link>
      </div>

      {unassigned.length > 0 ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {unassigned.length} order(s) are waiting for an agent.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              {["Order", "Customer", "Route", "Status", "Agent", "Total", "Assignment"].map(
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
              <tr key={order.id} className="border-b border-gray-100 align-top dark:border-gray-800">
                <td className="py-3 pr-4">
                  <Link href={`/orders/${order.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {order.orderNumber}
                  </Link>
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
                <td className="py-3 pr-4 font-mono text-xs">{order.totalCharge.toString()}</td>
                <td className="py-3 pr-4">
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
                      isTerminal: isTerminalStatus(order.status),
                    }}
                    agents={agentOptions}
                  />
                </td>
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
    </section>
  );
}
