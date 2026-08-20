import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";
import { prisma } from "@/lib/prisma";
import { availabilitySchema } from "@/lib/validation/agent";

export const dynamic = "force-dynamic";

/** The signed-in agent's own availability and current workload. */
export async function GET() {
  try {
    const user = await requireActiveUser("AGENT", "ADMIN");

    const agent = await prisma.agent.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        employeeCode: true,
        availability: true,
        currentZone: { select: { code: true, name: true } },
        _count: {
          select: {
            orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
          },
        },
      },
    });

    if (!agent) return fail("No agent profile for this account", 404);

    return ok({
      agent: {
        id: agent.id,
        employeeCode: agent.employeeCode,
        availability: agent.availability,
        currentZone: agent.currentZone,
        activeOrderCount: agent._count.orders,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[agent/availability:GET]", error);
    return fail("Could not load your status", 500);
  }
}

/**
 * Sets availability, scoped to the caller's own agent profile.
 *
 * The row is located by `userId` from the re-read session rather than by an id
 * in the body, so there is no shape of request that lets one agent mark another
 * available.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireActiveUser("AGENT", "ADMIN");

    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const agent = await prisma.agent.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!agent) return fail("No agent profile for this account", 404);

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: { availability: parsed.data.availability },
      select: {
        availability: true,
        employeeCode: true,
        _count: {
          select: {
            orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
          },
        },
      },
    });

    return ok({
      availability: updated.availability,
      // Surfaced so the UI can say what going offline does and does not do.
      activeOrderCount: updated._count.orders,
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[agent/availability:PATCH]", error);
    return fail("Could not update your status", 500);
  }
}
