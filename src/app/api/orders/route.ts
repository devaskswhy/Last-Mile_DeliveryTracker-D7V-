import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { OrderCreationError, createOrder } from "@/lib/orders/create";
import { prisma } from "@/lib/prisma";
import { RateEngineError, isAddressError } from "@/lib/rate-engine";
import { orderCreateSchema } from "@/lib/validation/order";

export const dynamic = "force-dynamic";

/**
 * Orders visible to the caller.
 *
 * Scoping is done here from the re-read session, never from a query parameter:
 * a customer sees their own orders, an agent sees what is assigned to them, an
 * admin sees everything.
 */
export async function GET(request: Request) {
  try {
    const user = await requireActiveUser();
    const status = new URL(request.url).searchParams.get("status");

    const scope =
      user.role === "ADMIN"
        ? {}
        : user.role === "AGENT"
          ? { assignedAgent: { userId: user.id } }
          : { customerId: user.id };

    const orders = await prisma.order.findMany({
      where: {
        ...scope,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderType: true,
        paymentType: true,
        scope: true,
        totalCharge: true,
        chargeableWeightKg: true,
        createdAt: true,
        pickupCity: true,
        pickupPincode: true,
        dropCity: true,
        dropPincode: true,
        pickupZone: { select: { code: true } },
        dropZone: { select: { code: true } },
        customer: { select: { id: true, name: true, email: true } },
        assignedAgent: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    return ok({
      orders: orders.map((order) => ({
        ...order,
        totalCharge: order.totalCharge.toString(),
        chargeableWeightKg: order.chargeableWeightKg.toString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[orders:GET]", error);
    return fail("Could not load orders", 500);
  }
}

/**
 * Creates an order from a confirmed quote.
 *
 * A CUSTOMER may only create their own; the `customerId` field is ignored for
 * them rather than trusted, so a customer cannot bill an order to someone else.
 * An ADMIN must name the customer they are acting for.
 */
export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = orderCreateSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const input = parsed.data;

    let customerId: string;
    if (user.role === "ADMIN") {
      if (!input.customerId) {
        return fail("Select the customer this order is for", 422);
      }
      customerId = input.customerId;
    } else if (user.role === "CUSTOMER") {
      // Deliberately ignores any customerId in the payload.
      customerId = user.id;
    } else {
      return fail("Agents cannot create orders", 403);
    }

    const result = await createOrder(
      {
        customerId,
        pickup: input.pickup,
        drop: input.drop,
        lengthCm: input.lengthCm,
        breadthCm: input.breadthCm,
        heightCm: input.heightCm,
        actualWeightKg: input.actualWeightKg,
        orderType: input.orderType,
        paymentType: input.paymentType,
        codAmount: input.codAmount,
        notes: input.notes,
        acknowledgedTotal: input.acknowledgedTotal,
      },
      { id: user.id, role: user.role },
    );

    return ok(result, 201);
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);

    if (error instanceof OrderCreationError) {
      // A stale quote is a conflict, not bad input: the request was valid when
      // it was composed and the caller needs the new number to try again.
      const status = error.code === "QUOTE_STALE" ? 409 : 422;
      return fail(error.message, status, {
        code: error.code,
        ...(error.details ?? {}),
      });
    }

    if (error instanceof RateEngineError) {
      return fail(error.message, isAddressError(error.code) ? 422 : 409, {
        code: error.code,
        ...(error.details ?? {}),
      });
    }

    console.error("[orders:POST]", error);
    return fail("Could not create the order", 500);
  }
}
