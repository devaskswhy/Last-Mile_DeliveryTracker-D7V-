import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { StatusError, updateOrderStatus } from "@/lib/orders/status";
import { agentStatusSchema } from "@/lib/validation/status";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const STATUS_BY_CODE: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  NOT_YOUR_ORDER: 403,
  ORDER_CLOSED: 409,
  SAME_STATUS: 409,
  INVALID_TRANSITION: 422,
  REASON_REQUIRED: 422,
};

/**
 * An agent moves their own order along the workflow.
 *
 * The role check is not just "is an AGENT" — `updateOrderStatus` verifies the
 * order is assigned to *this* agent, so one agent cannot advance another's work.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireActiveUser("AGENT", "ADMIN");

    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = agentStatusSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const result = await updateOrderStatus(
      params.id,
      { status: parsed.data.status, note: parsed.data.note },
      { id: user.id, role: user.role },
    );

    return ok(result);
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    if (error instanceof StatusError) {
      return fail(error.message, STATUS_BY_CODE[error.code] ?? 422, {
        code: error.code,
        ...(error.details ?? {}),
      });
    }
    console.error("[agent/orders/status]", error);
    return fail("Could not update the order status", 500);
  }
}
