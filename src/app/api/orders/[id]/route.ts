import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** One order with its full append-only status history, oldest first. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireActiveUser();

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        pickupZone: { select: { id: true, code: true, name: true } },
        dropZone: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: {
          select: {
            id: true,
            employeeCode: true,
            userId: true,
            user: { select: { name: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!order) return fail("Order not found", 404);

    // Ownership is checked after the read but before anything is returned, so
    // the 404/403 distinction never leaks which order ids exist.
    const isOwner = order.customerId === user.id;
    const isAssignedAgent = order.assignedAgent?.userId === user.id;
    if (user.role !== "ADMIN" && !isOwner && !isAssignedAgent) {
      return fail("You do not have access to this order", 403);
    }

    return ok({
      order: {
        ...order,
        lengthCm: order.lengthCm.toString(),
        breadthCm: order.breadthCm.toString(),
        heightCm: order.heightCm.toString(),
        actualWeightKg: order.actualWeightKg.toString(),
        volumetricWeightKg: order.volumetricWeightKg.toString(),
        chargeableWeightKg: order.chargeableWeightKg.toString(),
        freightCharge: order.freightCharge.toString(),
        codSurcharge: order.codSurcharge.toString(),
        totalCharge: order.totalCharge.toString(),
        codAmount: order.codAmount?.toString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[orders/:id]", error);
    return fail("Could not load the order", 500);
  }
}
