import { fail, ok } from "@/lib/api";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { TrackingAccessError, getOrderTracking } from "@/lib/orders/tracking";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * The order's full timeline: every history row in order, plus the current
 * status and the delivery attempts behind it.
 *
 * Access is checked inside `getOrderTracking`, so the rule is the same wherever
 * a timeline is read.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireActiveUser();
    const tracking = await getOrderTracking(params.id, {
      id: user.id,
      role: user.role,
    });
    return ok({ tracking });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    if (error instanceof TrackingAccessError) {
      return fail(error.message, error.status);
    }
    console.error("[orders/tracking]", error);
    return fail("Could not load the order timeline", 500);
  }
}
