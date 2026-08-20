import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { RescheduleError, rescheduleDelivery } from "@/lib/orders/reschedule";
import { rescheduleSchema } from "@/lib/validation/status";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const STATUS_BY_CODE: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  NOT_YOUR_ORDER: 403,
  NOT_FAILED: 409,
  DATE_IN_PAST: 422,
};

/**
 * The customer books a new delivery date after a failed attempt.
 *
 * Restricted to the order's owner (or an admin acting for them): the new date
 * is the customer's decision, so an agent cannot pick it for them.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireActiveUser();

    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    if (user.role === "AGENT") {
      return fail("Agents cannot reschedule a delivery", 403);
    }

    const result = await rescheduleDelivery(
      params.id,
      new Date(parsed.data.scheduledFor),
      { id: user.id, role: user.role },
      parsed.data.note,
    );

    return ok(result);
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    if (error instanceof RescheduleError) {
      return fail(error.message, STATUS_BY_CODE[error.code] ?? 422, {
        code: error.code,
        ...(error.details ?? {}),
      });
    }
    console.error("[orders/reschedule]", error);
    return fail("Could not reschedule the delivery", 500);
  }
}
