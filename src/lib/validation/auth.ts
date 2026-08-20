import { z } from "zod";

import { MAX_PASSWORD_BYTES, passwordByteLength } from "@/lib/auth/password";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .max(254);

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine(
    (value) => passwordByteLength(value) <= MAX_PASSWORD_BYTES,
    `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email,
  password,
  // Optional at registration; couriers collect it on the first order anyway.
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{7,20}$/, "Enter a valid phone number")
    .optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** "Forgot password" — request a reset link. */
export const forgotPasswordSchema = z.object({ email });

/**
 * Consuming a reset link. `token` is opaque from the client's point of view —
 * it is whatever arrived in the URL, validated for shape only; the real check
 * is the database lookup by its hash.
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Reset link is missing its token"),
  password,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
