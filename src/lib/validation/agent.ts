import { z } from "zod";

import { AGENT_AVAILABILITIES } from "@/lib/domain/enums";

/**
 * An agent setting their own availability.
 *
 * Availability governs auto-assignment only. Going OFFLINE means "stop giving
 * me new work", not "take back what I have" — orders already assigned stay
 * assigned, because a parcel in a van does not become undelivered because its
 * driver clocked off.
 */
export const availabilitySchema = z.object({
  availability: z.enum(AGENT_AVAILABILITIES),
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
