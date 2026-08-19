import { z } from "zod";

import { ORDER_TYPES, PAYMENT_TYPES } from "@/lib/domain/enums";

import { decimalInput } from "./money";

/**
 * Request shape for `POST /api/orders/quote`.
 *
 * Measurements are validated at the same scale the engine and the database use,
 * so a value that survives this schema cannot be rejected later for precision.
 * The engine re-validates anyway — it is a public function with its own
 * contract, not an internal helper that can assume a caller checked first.
 */
const dimension = (label: string) =>
  decimalInput(label, { scale: 2, min: 0, max: 1000, positive: true });

export const quoteRequestSchema = z.object({
  pickupPincode: z.string().trim().min(1, "Pickup pincode is required"),
  dropPincode: z.string().trim().min(1, "Drop pincode is required"),

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
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
