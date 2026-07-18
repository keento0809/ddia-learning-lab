import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma Client シングルトン。
 * ADR-007(05_ADR-007_インフラ選定.md §3)により接続はdriver adapter経由
 * (`@prisma/adapter-pg`)。Next.js dev の HMR で複数インスタンス化されるのを防ぐため
 * globalThis にキャッシュする(Next.js公式推奨パターン)。
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
