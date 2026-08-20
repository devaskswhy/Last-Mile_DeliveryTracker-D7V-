import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { StatusError, updateOrderStatus } from "@/lib/orders/status";
import { adminStatusSchema } from "@/lib/validation/status";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const STATUS_BY_CODE: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  SAME_STATUS: 409,
  REASON_REQUIRED: 422,
};

/**
 * Admin status override.
 *
 * Bypasses the state machine deliberately — correcting a mis-clicked status
 * means moving an order somewhere the normal flow forbids. The reason is
 * mandatory, and the change lands in the same append-only history as everything
 * else, attributed to the admin.
 */
export async function POST(request: Request, { params }: Params) {
  return adminRoute(async (admin) => {
    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = adminStatusSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    try {
      const result = await updateOrderStatus(
        params.id,
        { status: parsed.data.status, note: parsed.data.reason, override: true },
        { id: admin.id, role: "ADMIN" },
      );
      return ok(result);
    } catch (error) {
      if (error instanceof StatusError) {
        return fail(error.message, STATUS_BY_CODE[error.code] ?? 422, {
          code: error.code,
          ...(error.details ?? {}),
        });
      }
      throw error;
    }
  });
}
