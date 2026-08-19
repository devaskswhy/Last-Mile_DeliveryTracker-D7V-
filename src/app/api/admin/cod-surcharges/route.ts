import { ok, readJson, validationFailed } from "@/lib/api";
import { adminRoute } from "@/lib/admin/handler";
import { prisma } from "@/lib/prisma";
import { serializeDecimals } from "@/lib/serialize";
import { codSurchargeSchema } from "@/lib/validation/cod-surcharge";

export const dynamic = "force-dynamic";

const DECIMAL_FIELDS = ["amount", "percentage", "minAmount"] as const;

export async function GET() {
  return adminRoute(async () => {
    const configs = await prisma.codSurchargeConfig.findMany({
      orderBy: { orderType: "asc" },
    });
    return ok({
      codSurcharges: configs.map((c) => serializeDecimals(c, DECIMAL_FIELDS)),
    });
  });
}

/**
 * Upsert, keyed on order type — the column is unique, so there is exactly one
 * configuration per order type and "create" versus "update" is not a
 * distinction the admin should have to make.
 *
 * The fields belonging to the *other* mode are explicitly nulled on write.
 * Switching FIXED to PERCENTAGE while leaving a stale `amount` behind would
 * violate the CHECK constraint, and the row would be ambiguous besides.
 */
export async function PUT(request: Request) {
  return adminRoute(async () => {
    const body = await readJson(request);
    const parsed = codSurchargeSchema.safeParse(body);
    if (!parsed.success) return validationFailed(parsed.error);

    const input = parsed.data;

    const data =
      input.mode === "FIXED"
        ? {
            mode: "FIXED" as const,
            amount: input.amount,
            percentage: null,
            minAmount: null,
            isActive: input.isActive ?? true,
          }
        : {
            mode: "PERCENTAGE" as const,
            amount: null,
            percentage: input.percentage,
            minAmount: input.minAmount ?? null,
            isActive: input.isActive ?? true,
          };

    const config = await prisma.codSurchargeConfig.upsert({
      where: { orderType: input.orderType },
      update: data,
      create: { orderType: input.orderType, ...data },
    });

    return ok({ codSurcharge: serializeDecimals(config, DECIMAL_FIELDS) });
  });
}
