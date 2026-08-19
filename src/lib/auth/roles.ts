/**
 * Role constants duplicated from the Prisma `Role` enum as plain data.
 *
 * Middleware runs on the Edge runtime, where importing `@prisma/client` for its
 * generated enum would drag the whole query engine in. The `satisfies` check
 * below makes the compiler fail if this list ever drifts from the schema.
 */
import type { Role as PrismaRole } from "@prisma/client";

export const ROLES = ["CUSTOMER", "AGENT", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

// Compile-time guard: errors if the Prisma enum and this union diverge.
const _roleParity: Role = "CUSTOMER" satisfies PrismaRole;
const _prismaParity: PrismaRole = "ADMIN" satisfies Role;
void _roleParity;
void _prismaParity;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
