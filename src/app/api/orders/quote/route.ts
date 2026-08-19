import { fail, ok, readJson, validationFailed } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import {
  RateEngineError,
  calculateRate,
  isAddressError,
  loadRateConfig,
  type RateEngineErrorCode,
} from "@/lib/rate-engine";
import { quoteRequestSchema } from "@/lib/validation/quote";

export const dynamic = "force-dynamic";

/**
 * Prices a shipment without creating anything.
 *
 * The order form calls this as the customer types, so it is a read-only quote:
 * no order row, no status history, no side effects at all. Middleware already
 * restricts `/api/orders/*` to signed-in users, and the handler re-checks the
 * account is still active — rate cards are commercial information and this
 * endpoint exposes them one lookup at a time.
 */
export async function POST(request: Request) {
  try {
    await requireActiveUser();

    const body = await readJson(request);
    if (body === undefined) return fail("Request body must be valid JSON", 400);

    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const input = parsed.data;

    const config = await loadRateConfig(
      input.pickupPincode,
      input.dropPincode,
      input.orderType,
    );

    const quote = calculateRate(
      {
        pickupPincode: input.pickupPincode,
        dropPincode: input.dropPincode,
        dimensionsCm: {
          lengthCm: input.lengthCm,
          breadthCm: input.breadthCm,
          heightCm: input.heightCm,
        },
        actualWeightKg: input.actualWeightKg,
        orderType: input.orderType,
        paymentType: input.paymentType,
      },
      config,
    );

    return ok({ quote });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);

    if (error instanceof RateEngineError) {
      return fail(error.message, statusFor(error.code), {
        code: error.code,
        ...(error.details ?? {}),
      });
    }

    console.error("[orders/quote]", error);
    return fail("Could not price this shipment", 500);
  }
}

/**
 * Two different audiences, two different statuses.
 *
 * An unresolvable address is something the customer can fix by editing the
 * form, so it is a 422 against their input. A missing rate card is a hole in
 * the configuration that only an admin can fill — the request was perfectly
 * valid — so it answers 409 and the frontend can say "we cannot price this
 * route yet" rather than blaming the address.
 */
function statusFor(code: RateEngineErrorCode): number {
  return isAddressError(code) ? 422 : 409;
}
