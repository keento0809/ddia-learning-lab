import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Miniflare } from "miniflare";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ADR-008(docs/design/09) §2・§4 T-503受入基準: `/internal/auth/verify-credentials`
 * `/internal/auth/oauth-upsert`(および同じくPrisma除去のため実装した
 * signup/reset-request/reset-confirm)が、実際に`wrangler deploy --dry-run`で
 * バンドルしたworker-apiをMiniflare(workerd)上で起動した状態で正しく動作する
 * ことを検証する。tests/integration/auth.flow.integration.test.tsはNode環境で
 * dispatchToWorkerApi/workerApiAuthをworker-apiのHonoアプリへインプロセスで
 * 直結してビジネスロジックを検証しているのに対し、このテストは実バンドル・
 * 実workerd経由でhash-wasm(Argon2id)・jose(JWT署名)・Prisma(runtime="workerd")が
 * 揃って動作することそのものを検証する(workers/api/tests/apiRoutes.test.tsと
 * 同じ手法・同じ理由)。
 *
 * テスト用Postgres(docker-compose.test.yml)が必要。`npm run test:workers`
 * (scripts/test-workers.sh)から実行する。
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const COMPATIBILITY_DATE = "2024-09-23";
const AUTH_SECRET = "test-integration-auth-secret-not-for-production-use";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://ddia:ddia@localhost:5433/ddia_test?schema=public";

describe("worker-api: /internal/auth/* (T-503, 実バンドル)", () => {
  let mf: Miniflare;
  let outDir: string;
  let db: Client;

  beforeAll(async () => {
    outDir = mkdtempSync(path.join(repoRoot, ".tmp-worker-api-internal-auth-dryrun-"));
    execFileSync(
      "npx",
      ["wrangler", "deploy", "--dry-run", "--config", "workers/api/wrangler.jsonc", "--outdir", outDir],
      { cwd: repoRoot, stdio: "inherit" },
    );

    mf = new Miniflare({
      workers: [
        {
          name: "ddia-learning-lab-api",
          modules: true,
          scriptPath: path.join(outDir, "index.js"),
          modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
          compatibilityDate: COMPATIBILITY_DATE,
          compatibilityFlags: ["nodejs_compat"],
          bindings: { AUTH_SECRET, DATABASE_URL },
        },
      ],
    });

    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    await mf?.dispose();
    rmSync(outDir, { recursive: true, force: true });
  });

  it("signup -> 重複signup(409) -> verify-credentials(200/401)の一連が実バンドルで動く", async () => {
    const email = `internal-auth-${randomUUID()}@example.com`;
    const password = "correct horse battery staple";

    const signupRes = await mf.dispatchFetch("http://worker-api.internal/internal/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Internal Auth Test" }),
    });
    expect(signupRes.status).toBe(201);
    const signupBody = (await signupRes.json()) as { id: string; email: string };
    expect(signupBody.email).toBe(email);

    const duplicateRes = await mf.dispatchFetch("http://worker-api.internal/internal/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Internal Auth Test" }),
    });
    expect(duplicateRes.status).toBe(409);

    const verifyOkRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/verify-credentials",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
    );
    expect(verifyOkRes.status).toBe(200);
    const verifyOkBody = (await verifyOkRes.json()) as { id: string; email: string };
    expect(verifyOkBody.id).toBe(signupBody.id);

    const verifyBadRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/verify-credentials",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      },
    );
    expect(verifyBadRes.status).toBe(401);
  });

  it("oauth-upsert: 新規作成→同一provider account再送で同一ユーザーに解決する", async () => {
    const email = `internal-auth-oauth-${randomUUID()}@example.com`;
    const providerAccountId = randomUUID();

    const firstRes = await mf.dispatchFetch("http://worker-api.internal/internal/auth/oauth-upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", providerAccountId, email, name: "OAuth Test" }),
    });
    expect(firstRes.status).toBe(200);
    const firstBody = (await firstRes.json()) as { id: string; email: string };

    const secondRes = await mf.dispatchFetch("http://worker-api.internal/internal/auth/oauth-upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", providerAccountId, email, name: "OAuth Test" }),
    });
    expect(secondRes.status).toBe(200);
    const secondBody = (await secondRes.json()) as { id: string; email: string };
    expect(secondBody.id).toBe(firstBody.id);

    const result = await db.query<{ count: string }>(
      `SELECT count(*)::text FROM oauth_accounts WHERE provider = $1 AND provider_account_id = $2`,
      ["github", providerAccountId],
    );
    expect(result.rows[0]?.count).toBe("1");
  });

  it("reset-request -> reset-confirm: 実際にpasswordHashが更新され、旧トークンは使い切りになる", async () => {
    const email = `internal-auth-reset-${randomUUID()}@example.com`;
    const originalPassword = "original-password-1234";
    const newPassword = "new-password-5678";

    await mf.dispatchFetch("http://worker-api.internal/internal/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: originalPassword, displayName: "Reset Test" }),
    });

    const resetRequestRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/reset-request",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );
    expect(resetRequestRes.status).toBe(200);
    const { resetToken } = (await resetRequestRes.json()) as { resetToken: string | null };
    expect(resetToken).toBeTruthy();

    const confirmRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/reset-confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      },
    );
    expect(confirmRes.status).toBe(200);

    const verifyNewRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/verify-credentials",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: newPassword }),
      },
    );
    expect(verifyNewRes.status).toBe(200);

    // 使い切り制約: パスワード変更後は同じresetTokenで再度confirmできない
    const reuseRes = await mf.dispatchFetch(
      "http://worker-api.internal/internal/auth/reset-confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: "yet-another-password" }),
      },
    );
    expect(reuseRes.status).toBe(400);
  });

  it("reset-request: 存在しないメールでも200かつresetToken:nullを返す(列挙対策)", async () => {
    const res = await mf.dispatchFetch("http://worker-api.internal/internal/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `no-such-user-${randomUUID()}@example.com` }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resetToken: string | null };
    expect(body.resetToken).toBeNull();
  });
});
