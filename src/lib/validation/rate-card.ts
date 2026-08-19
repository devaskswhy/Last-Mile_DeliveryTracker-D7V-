import { z } from "zod";

import { ORDER_TYPES, RATE_SCOPES, deriveScope } from "@/lib/domain/enums";

import { currency, weightKg } from "./money";

/**
 * Rate-card input.
 *
 * `scope` is deliberately **not** a free choice. It is a function of the zone
 * pair — same zone means INTRA, different zones mean INTER — and the rate
 * lookup will compute it exactly that way from an order's pickup and drop
 * zones. Letting an admin store a scope that disagrees with the zone pair would
 * create a row that no lookup can ever match: present in the table, invisible
 * in practice, and impossible to debug from the symptom.
 *
 * So the field is optional on input. When supplied it is checked against the
 * derived value and rejected on mismatch (which gives a clear error to an API
 * client that got it wrong); when omitted it is filled in. Either way the
 * stored row is consistent, and a CHECK constraint in the database enforces the
 * same invariant against anything that bypasses this schema.
 */
const baseFields = {
  orderType: z.enum(ORDER_TYPES),
  fromZoneId: z.string().trim().min(1, "Select an origin zone"),
  toZoneId: z.string().trim().min(1, "Select a destination zone"),
  baseRate: currency("Base rate"),
  baseWeightKg: weightKg("Base weight", true),
  perKgRate: currency("Per-kg rate"),
  isActive: z.boolean().optional(),
};

export const rateCardCreateSchema = z
  .object({ ...baseFields, scope: z.enum(RATE_SCOPES).optional() })
  .transform((value) => ({
    ...value,
    scope: value.scope ?? deriveScope(value.fromZoneId, value.toZoneId),
  }))
  .superRefine((value, ctx) => {
    const derived = deriveScope(value.fromZoneId, value.toZoneId);
    if (value.scope !== derived) {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message:
          value.fromZoneId === value.toZoneId
            ? "A card for a single zone is INTRA, not INTER"
            : "A card between two different zones is INTER, not INTRA",
      });
    }
  });

/**
 * Updates cannot move a card to a different zone pair or order type: that would
 * silently retarget an existing price, and the unique key
 * (orderType, scope, fromZoneId, toZoneId) means the "moved" card could collide
 * with a real one. Retargeting is delete-then-create, done deliberately.
 */
export const rateCardUpdateSchema = z
  .object({
    baseRate: currency("Base rate").optional(),
    baseWeightKg: weightKg("Base weight", true).optional(),
    perKgRate: currency("Per-kg rate").optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update",
  );

/** Bulk creation, used to close coverage gaps in one call. */
export const rateCardBulkSchema = z.object({
  cards: z
    .array(rateCardCreateSchema)
    .min(1, "Provide at least one rate card")
    .max(500, "Provide at most 500 rate cards per request"),
});

export type RateCardCreateInput = z.infer<typeof rateCardCreateSchema>;
export type RateCardUpdateInput = z.infer<typeof rateCardUpdateSchema>;
