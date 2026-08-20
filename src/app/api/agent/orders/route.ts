import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";
import { nextActionsFor } from "@/lib/orders/tracking";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The signed-in agent's own workload, with the moves available on each order. */
export async function GET(request: Request) {
  try {
    const user = await requireActiveUser("AGENT", "ADMIN");
    const includeClosed =
      new URL(request.url).searchParams.get("all") === "true";

    const orders = await prisma.order.findMany({
      where: {
        assignedAgent: { userId: user.id },
        ...(includeClosed
          ? {}
          : { status: { in: [...ACTIVE_ORDER_STATUSES] } }),
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

    return ok({
      orders: orders.map((order) => ({
        ...order,
        codAmount: order.codAmount?.toString() ?? null,
        totalCharge: order.totalCharge.toString(),
        nextStatuses: nextActionsFor(order.status),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[agent/orders]", error);
    return fail("Could not load your orders", 500);
  }
}
