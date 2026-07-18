import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma Client シングルトン(遅延初期化)。
 * ADR-007(05_ADR-007_インフラ選定.md §3)により接続はdriver adapter経由
 * (`@prisma/adapter-pg`)。Next.js dev の HMR で複数インスタンス化されるのを防ぐため
 * globalThis にキャッシュする(Next.js公式推奨パターン)。
 *
 * 生成はモジュール読み込み時ではなく初回プロパティアクセス時まで遅延させる
 * (Proxy経由)。`next build`の「Collecting page data」はRoute Handlerモジュールを
 * クエリを実行せずimportして静的解析するだけだが、以前はモジュール読み込み時点で
 * PrismaClientを即時生成していたため、DATABASE_URL未設定のビルド環境(CIのbuild
 * ジョブはDB接続情報を渡さない)で`lib/db.ts`をimportするRoute Handlerを追加した
 * 途端にビルド自体が失敗した(T-005実施中にCIで発覚)。
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

let cachedClient: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production" && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (!cachedClient) {
    cachedClient = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = cachedClient;
    }
  }
  return cachedClient;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    // $connect/$disconnect/$transaction等はクラスメソッドで内部的にthisに依存する。
    // `prisma.$connect()`はthis=Proxyで呼び出されるため、実クライアントへ明示的に
    // bindしないと壊れる(user/progress等のデリゲートは既にclient経由の取得で
    // 正しくthis解決済みのため対象外)。
    return typeof value === "function" ? value.bind(client) : value;
  },
});
