import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 *
 * In dev, Next.js hot-reloads modules, which would otherwise spin up a new
 * PrismaClient (and new DB connection pool) on every edit. Stashing it on
 * `globalThis` survives the reload. `server-only` guarantees this file can
 * never be pulled into a client bundle.
 */

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
