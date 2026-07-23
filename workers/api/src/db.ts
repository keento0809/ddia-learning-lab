import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import type { Env } from "./env";

/**
 * lib/db.ts(Next.js/worker-app側)とは意図的に別実装。
 *
 * lib/db.tsはprocess.env.NODE_ENV!=="production"時にglobalThisへPrismaClientを
 * キャッシュし、リクエストを跨いで同一接続を再利用する(Next.js/Node.jsのHMR・
 * ウォームプロセスでは正しいパターン)。worker-api(Cloudflare Workers/workerd)で
 * 同じキャッシュ戦略を使うと、失敗→恒久対策(T-502)として実際に検出した問題が
 * 起きる: あるリクエストのI/Oコンテキストで開いたTCP接続(@prisma/adapter-pgの
 * 生pg接続)を別リクエストのI/Oコンテキストで再利用すると、workerdのリクエスト単位
 * I/O分離により後続リクエストがハングし「The Workers runtime canceled this
 * request because it detected that your Worker's code had hung」で失敗する
 * (workers/api/tests/apiRoutes.test.tsで2リクエスト目以降のDB到達テストとして再現)。
 *
 * そのためworker-apiではキャッシュせず、リクエストごとに新規PrismaClientを生成する。
 */
export function createPrismaClient(env: Env): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}
