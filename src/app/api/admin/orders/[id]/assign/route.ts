import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { AssignError, assignOrder } from "@/lib/orders/assign";
import { assignSchema } from "@/lib/validation/order";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const STATUS_BY_CODE: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  AGENT_NOT_FOUND: 404,
  ORDER_TERMINAL: 409,
  ALREADY_ASSIGNED: 409,
  NO_AGENT_AVAILABLE: 409,
  AGENT_INACTIVE: 422,
};

/**
 * Assigns or reassigns an order.
 *
 * `{ "mode": "MANUAL", "agentId": "..." }` picks an agent explicitly;
 * `{ "mode": "AUTO" }` re-runs the auto-assignment policy, which is how an
 * order left unassigned at creation gets retried once an agent frees up.
 */
export async function POST(request: Request, { params }: Params) {
  return adminRoute(async (admin) => {
    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    try {
      const result = await assignOrder(params.id, parsed.data, {
        id: admin.id,
        role: "ADMIN",
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AssignError) {
        return fail(error.message, STATUS_BY_CODE[error.code] ?? 422, {
          code: error.code,
          ...(error.details ?? {}),
        });
      }
      throw error;
    }
  });
}
