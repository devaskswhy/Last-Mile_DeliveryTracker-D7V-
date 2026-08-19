import { z } from "zod";

/**
 * A Zone is the unit that rate cards are priced between. Its `code` is the
 * stable handle shown in rate-card tables and coverage reports, so it is
 * normalised to upper case and constrained to a compact token.
 */
export const zoneCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Zone name must be at least 2 characters")
    .max(80, "Zone name must be at most 80 characters"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Zone code must be at least 2 characters")
    .max(20, "Zone code must be at most 20 characters")
    .regex(
      /^[A-Z0-9_]+$/,
      "Zone code may contain only letters, digits and underscores",
    ),
  isActive: z.boolean().optional(),
});

export const zoneUpdateSchema = zoneCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update",
);

export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdateInput = z.infer<typeof zoneUpdateSchema>;
