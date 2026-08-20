import { ok } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Agents with their live workload, for the manual-assignment picker. */
export async function GET() {
  return adminRoute(async () => {
    const agents = await prisma.agent.findMany({
      orderBy: { employeeCode: "asc" },
      select: {
        id: true,
        employeeCode: true,
        availability: true,
        currentZoneId: true,
        currentZone: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, name: true, email: true, isActive: true } },
        _count: {
          select: {
            orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
          },
        },
      },
    });

    return ok({
      agents: agents.map((agent) => ({
        id: agent.id,
        employeeCode: agent.employeeCode,
        name: agent.user.name,
        email: agent.user.email,
        isActive: agent.user.isActive,
        availability: agent.availability,
        currentZone: agent.currentZone,
        activeOrderCount: agent._count.orders,
      })),
    });
  });
}
