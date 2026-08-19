import { z } from "zod";

/**
 * An Area binds a pincode to exactly one Zone. Pickup and drop addresses will
 * resolve to a zone through this table, which is why the pincode is normalised
 * (upper case, no internal spaces) before it is stored — otherwise "110 085"
 * and "110085" would be two different keys for one place.
 *
 * The format is intentionally permissive: postal codes differ by country, and
 * baking one country's shape into validation would be a hidden policy decision.
 */
const pincode = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]+/g, ""))
  .refine(
    (value) => /^[A-Z0-9]{3,12}$/.test(value),
    "Pincode must be 3–12 letters or digits",
  );

export const areaCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Area name must be at least 2 characters")
    .max(120, "Area name must be at most 120 characters"),
  pincode,
  zoneId: z.string().trim().min(1, "Select a zone"),
  isActive: z.boolean().optional(),
});

export const areaUpdateSchema = areaCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update",
  );

export type AreaCreateInput = z.infer<typeof areaCreateSchema>;
export type AreaUpdateInput = z.infer<typeof areaUpdateSchema>;
