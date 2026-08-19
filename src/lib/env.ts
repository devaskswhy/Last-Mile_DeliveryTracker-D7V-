import { z } from "zod";

/**
 * Server-side environment contract. Parsed once at module load so a missing or
 * malformed variable fails loudly at boot rather than at the first request.
 *
 * Not importable from Edge middleware — see `src/lib/auth/jwt.ts`, which reads
 * only the handful of variables the Edge runtime exposes.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
  AUTH_COOKIE_NAME: z.string().min(1).default("lm_session"),

  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
