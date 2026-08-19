import { fail, ok } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { ORDER_TYPES, type OrderType } from "@/lib/domain/enums";
import { prisma } from "@/lib/prisma";
import { serializeDecimals } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Params = { params: { orderType: string } };

const DECIMAL_FIELDS = ["amount", "percentage", "minAmount"] as const;

function parseOrderType(value: string): OrderType | null {
  const upper = value.toUpperCase();
  return (ORDER_TYPES as readonly string[]).includes(upper)
    ? (upper as OrderType)
    : null;
}

export async function GET(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const orderType = parseOrderType(params.orderType);
    if (!orderType) return fail("Unknown order type", 404);

    const config = await prisma.codSurchargeConfig.findUnique({
      where: { orderType },
    });
    if (!config) return fail("No COD surcharge configured for that order type", 404);

    return ok({ codSurcharge: serializeDecimals(config, DECIMAL_FIELDS) });
  });
}

/**
 * Removes the configuration entirely. COD orders of this type then have no
 * surcharge rule at all, which `config-health` reports as a gap rather than
 * treating as "charge nothing" — silence is not a pricing decision.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return adminRoute(async () => {
    const orderType = parseOrderType(params.orderType);
    if (!orderType) return fail("Unknown order type", 404);

    await prisma.codSurchargeConfig.delete({ where: { orderType } });
    return ok({ deleted: true });
  });
}
