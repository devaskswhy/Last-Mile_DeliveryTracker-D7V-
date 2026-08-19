import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient per process. Next.js dev mode re-evaluates modules on
 * every hot reload, which would otherwise open a new connection pool each time
 * and exhaust the database's connection limit.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
