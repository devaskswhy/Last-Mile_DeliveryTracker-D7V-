import { z } from "zod";

import { ORDER_TYPES } from "@/lib/domain/enums";

import { currency, percentage } from "./money";

/**
 * COD surcharge configuration, one row per order type.
 *
 * A discriminated union rather than a flat object with optional fields: the two
 * modes need different data, and a flat shape would happily accept a
 * PERCENTAGE row carrying an `amount` and no `percentage`. That row would then
 * compute a surcharge of nothing at all. The union makes the wrong shapes
 * unrepresentable, and a CHECK constraint enforces the same rule in the
 * database.
 */
export const codSurchargeSchema = z.discriminatedUnion("mode", [
  z.object({
    orderType: z.enum(ORDER_TYPES),
    mode: z.literal("FIXED"),
    /** Flat charge added to the freight total. */
    amount: currency("Amount"),
    isActive: z.boolean().optional(),
  }),
  z.object({
    orderType: z.enum(ORDER_TYPES),
    mode: z.literal("PERCENTAGE"),
    /** Percent of the freight charge, e.g. "2.50" for 2.5%. */
    percentage: percentage("Percentage"),
    /** Optional floor, so small orders still carry a worthwhile surcharge. */
    minAmount: currency("Minimum amount").optional(),
    isActive: z.boolean().optional(),
  }),
]);

export type CodSurchargeInput = z.infer<typeof codSurchargeSchema>;
