import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasourceUrl: appendPoolParams(process.env.DATABASE_URL ?? ""),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function appendPoolParams(url: string): string {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  // Keep pool small to avoid exhausting Railway's PostgreSQL connection limit (~20-25 total).
  // pool_timeout=10 releases idle connections after 10s.
  return `${url}${separator}connection_limit=5&pool_timeout=10`;
}
