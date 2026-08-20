import { z } from "zod";

import { ORDER_TYPES, PAYMENT_TYPES } from "@/lib/domain/enums";

import { currency, decimalInput } from "./money";

const dimension = (label: string) =>
  decimalInput(label, { scale: 2, min: 0, max: 1000, positive: true });

const addressSchema = z.object({
  contactName: z.string().trim().min(2, "Contact name is required").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{7,20}$/, "Enter a valid phone number"),
  addressLine1: z.string().trim().min(3, "Address is required").max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(2, "City is required").max(120),
  pincode: z.string().trim().min(1, "Pincode is required").max(20),
});

/**
 * Order creation.
 *
 * `acknowledgedTotal` is required, not optional. It is what turns "explicit
 * confirmation" from a property of whichever UI happens to call this into a
 * property of the API: a caller cannot create an order without stating the
 * total it is agreeing to, and the server refuses if that disagrees with the
 * price it recomputes. Charges themselves are never accepted from the client —
 * only this one figure, and only to be checked.
 */
export const orderCreateSchema = z
  .object({
    /** Admin only; a customer's order is always their own. */
    customerId: z.string().trim().min(1).optional(),

    pickup: addressSchema,
    drop: addressSchema,

    lengthCm: dimension("Length"),
    breadthCm: dimension("Breadth"),
    heightCm: dimension("Height"),
    actualWeightKg: decimalInput("Actual weight", {
      scale: 3,
      min: 0,
      max: 100_000,
      positive: true,
    }),

    orderType: z.enum(ORDER_TYPES),
    paymentType: z.enum(PAYMENT_TYPES),

    /** Amount to collect from the consignee — the goods value, not the freight. */
    codAmount: currency("COD amount").optional(),

    notes: z.string().trim().max(1000).optional().nullable(),

    acknowledgedTotal: currency("Confirmed total"),
  })
  .superRefine((value, ctx) => {
    if (value.paymentType === "COD" && value.codAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["codAmount"],
        message: "A COD order needs the amount to collect from the consignee",
      });
    }
    if (value.paymentType !== "COD" && value.codAmount !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["codAmount"],
        message: "Only a COD order carries an amount to collect",
      });
    }
  });

export const assignSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("MANUAL"),
    agentId: z.string().trim().min(1, "Select an agent"),
  }),
  z.object({ mode: z.literal("AUTO") }),
]);

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type AssignInput = z.infer<typeof assignSchema>;
