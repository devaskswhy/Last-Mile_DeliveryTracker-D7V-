import { z } from "zod";

import { ORDER_STATUSES } from "@/lib/domain/enums";

/** Agent-driven status update. The note carries a failure reason on FAILED. */
export const agentStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Admin override. `reason` is required rather than optional: an override steps
 * outside the state machine, and the only thing that makes that accountable
 * later is a note saying why.
 */
export const adminStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z
    // The message is attached to the type check too, so an omitted field reads
    // as "a reason is required" rather than Zod's generic "Invalid input".
    .string({ error: "A reason is required for an override" })
    .trim()
    .min(3, "Give a reason for the override")
    .max(500),
});

export const rescheduleSchema = z.object({
  /** ISO date or datetime; validated as a real future instant. */
  scheduledFor: z
    .string()
    .trim()
    .min(1, "Pick a delivery date")
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "That is not a valid date",
    ),
  note: z.string().trim().max(500).optional().nullable(),
});

export type AgentStatusInput = z.infer<typeof agentStatusSchema>;
export type AdminStatusInput = z.infer<typeof adminStatusSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
