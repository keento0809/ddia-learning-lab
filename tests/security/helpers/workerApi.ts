import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

/**
 * T-703共通テストヘルパ。worker-api(workers/api/src/index.ts)をMiniflare/実service
 * bindingを介さずインプロセスで直接呼び出す(tests/integration/setup.tsの
 * dispatchToWorkerApiモックと同じ技法: vitest.security.config.tsのPrisma workerd
 * エイリアスにより`@/lib/generated/prisma-workerd/client`がNode向けクライアントへ
 * 差し替わっているため、workers/api/src/index.tsを直接importして`app.fetch(request,
 * bindings)`を呼べる)。実Hono app・実JWT検証(@auth/core/jwt)・実Prisma・実DBを
 * 経由するため認可ロジックの検証としては実質的にworkers/api/tests/*(Miniflare)と
 * 同等だが、workerd固有のランタイム層(WASM query compiler等、既にT-501/502で
 * 別途検証済み)を含まない分軽量に多数のシナリオを実行できる。
 */

export const SECURITY_TEST_AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-integration-auth-secret-not-for-production-use";
const DATABASE_URL = process.env.DATABASE_URL!;

export const SESSION_COOKIE_NAME = "authjs.session-token";

export async function callWorkerApi(request: Request): Promise<Response> {
  const { default: app } = await import("@/workers/api/src/index");
  return app.fetch(request, {
    AUTH_SECRET: SECURITY_TEST_AUTH_SECRET,
    DATABASE_URL,
  });
}

export async function sessionCookieFor(userId: string, secret = SECURITY_TEST_AUTH_SECRET): Promise<string> {
  const token = await encode({ token: { uid: userId }, secret, salt: SESSION_COOKIE_NAME });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

export async function createTestUser(overrides: { email?: string; password?: string } = {}) {
  const email = overrides.email ?? `t703-${randomUUID()}@example.com`;
  const password = overrides.password ?? "correct horse battery staple";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName: "T-703 Test User" },
  });
  return { id: user.id, email, password };
}
