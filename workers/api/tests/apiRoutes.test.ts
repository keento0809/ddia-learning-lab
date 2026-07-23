import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Miniflare } from "miniflare";
import { encode } from "@auth/core/jwt";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ADR-008(docs/design/09) §2・T-502受入基準(2)(3)(4): progress/submissions/
 * dashboard/guest-progressの4ハンドラがworker-api(Hono)へ実際に移設され、
 * worker-appからservice binding経由で到達可能で、worker-api側のJWT検証で
 * ユーザーが特定されることを、T-501のserviceBinding.test.tsと同じ手法
 * (`wrangler deploy --dry-run`で実バンドルしたworker-apiをMiniflare(workerd)上で
 * 起動)で検証する。既存の統合テスト(tests/integration/*)はNode環境で
 * dispatchToWorkerApiをworker-apiのHonoアプリへインプロセスで直結してビジネス
 * ロジックを検証しているのに対し、このテストは実際のCloudflare service binding
 * (env.API.fetch)・実バンドル・実workerd経由でPrisma(runtime="workerd"、
 * query compiler WASM)が動作することそのものを検証する対象が異なる。
 *
 * 検証用のDB直接アクセスには生の`pg`クライアントを使う(Prismaの生成クライアント
 * ではない): lib/generated/prisma/internal/class.tsは`import("*.wasm?module")`を
 * 含み、これをこのテストファイル自身がトップレベルでimportするとVitest側の
 * Vite変換(vite:import-analysis、Workers専用の`?module`規約を知らない)が
 * 解析エラーになるため(Miniflare側でのCompiledWasm解決とは別の問題)。
 *
 * テスト用Postgres(docker-compose.test.yml)が必要。`npm run test:workers`
 * (scripts/test-workers.sh)から実行する。
 *
 * 失敗→恒久対策(T-502): 当初、同一Miniflare(workerd)インスタンス内で2件目以降の
 * DB到達リクエストが"The Workers runtime canceled this request because it
 * detected that your Worker's code had hung"で確実に失敗する事象を検出した。
 * 切り分け実験(単独実行=緑、DB到達テストを連続実行=2件目以降が必ずhang)により、
 * lib/db.ts(Next.js側)相当のPrismaシングルトンキャッシュ(グローバルに同一
 * PrismaClient/pg接続をリクエスト間で使い回す設計)が、Cloudflare Workersの
 * リクエスト単位I/O分離(あるリクエストのI/Oコンテキストで開いた接続は別
 * リクエストのI/Oコンテキストで再利用できない)と衝突することが原因と判明。
 * worker-api専用のworkers/api/src/db.ts(lib/db.tsとは別実装、詳細はそちらの
 * コメント参照)ではリクエストごとに新規PrismaClientを生成・都度$disconnect()
 * する設計とし、キャッシュを廃したことで解消した。
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const COMPATIBILITY_DATE = "2024-09-23";
const AUTH_SECRET = "test-integration-auth-secret-not-for-production-use";
const SESSION_COOKIE_NAME = "authjs.session-token";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://ddia:ddia@localhost:5433/ddia_test?schema=public";

describe("worker-app -> worker-api service binding: 実APIルート(T-502)", () => {
  let mf: Miniflare;
  let outDir: string;
  let db: Client;
  let userId: string;

  beforeAll(async () => {
    outDir = mkdtempSync(path.join(repoRoot, ".tmp-worker-api-routes-dryrun-"));
    execFileSync(
      "npx",
      [
        "wrangler",
        "deploy",
        "--dry-run",
        "--config",
        "workers/api/wrangler.jsonc",
        "--outdir",
        outDir,
      ],
      { cwd: repoRoot, stdio: "inherit" },
    );

    mf = new Miniflare({
      workers: [
        {
          name: "worker-app-stub",
          modules: [
            {
              type: "ESModule",
              path: "index.mjs",
              contents: `export default { fetch(request, env) { return env.API.fetch(request); } };`,
            },
          ],
          compatibilityDate: COMPATIBILITY_DATE,
          serviceBindings: { API: "ddia-learning-lab-api" },
        },
        {
          name: "ddia-learning-lab-api",
          modules: true,
          scriptPath: path.join(outDir, "index.js"),
          // workers/api/tests/serviceBinding.test.tsと同じ理由(T-502失敗→恒久対策):
          // Prisma(runtime="workerd")のquery compiler WASMをMiniflareへ明示的に
          // CompiledWasmモジュールとして解決させる。
          modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
          compatibilityDate: COMPATIBILITY_DATE,
          compatibilityFlags: ["nodejs_compat"],
          bindings: { AUTH_SECRET, DATABASE_URL },
        },
      ],
    });

    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    const result = await db.query<{ id: string }>(
      `INSERT INTO users (email, display_name, updated_at) VALUES ($1, $2, now()) RETURNING id`,
      [`worker-api-routes-${randomUUID()}@example.com`, "Worker API Routes Test"],
    );
    userId = result.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    await mf?.dispose();
    rmSync(outDir, { recursive: true, force: true });
  });

  async function sessionCookieHeader(): Promise<string> {
    const token = await encode({ token: { uid: userId }, secret: AUTH_SECRET, salt: SESSION_COOKIE_NAME });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  it("GET /api/dashboard: 未認証はunauthorized(401)を返す", async () => {
    const res = await mf.dispatchFetch("http://worker-app.local/api/dashboard");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("GET /api/dashboard: 実際に署名したJWT Cookieで認証され、Prisma経由で実DBから集計結果を返す", async () => {
    const cookie = await sessionCookieHeader();
    const res = await mf.dispatchFetch("http://worker-app.local/api/dashboard", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overall: { lessonsDone: number; exercisesPassed: number };
      badges: unknown[];
    };
    expect(body.overall.lessonsDone).toBe(0);
    expect(body.overall.exercisesPassed).toBe(0);
    expect(body.badges).toEqual([]);
  });

  it("PUT /api/progress: service binding経由でも状態変更が実DBへ反映される", async () => {
    const cookie = await sessionCookieHeader();
    // ダブルサブミットCSRF方式(workers/api/src/csrf.ts)はcookie値とヘッダ値の一致
    // のみを検証し、サーバ発行のトークンである必要はない(lib/api/csrf.tsの
    // verifyCsrfTokenと同型)。そのためこのテストでは一致するペアを直接用意する。
    // (GET /api/progressでサーバ発行cookieを取得する経路は、tests/integration/
    // progress.flow.integration.test.tsで既にNode上で検証済み。このテストは
    // service binding越しの実Worker到達性・JWT検証・実DB反映が目的のため対象外)
    const csrfToken = "test-csrf-token-for-worker-api-route-test";

    const putRes = await mf.dispatchFetch("http://worker-app.local/api/progress", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: `${cookie}; csrf-token=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        itemType: "lesson",
        itemSlug: "01-reliability/01-load-and-performance",
        status: "in_progress",
        clientTz: "UTC",
      }),
    });
    expect(putRes.status).toBe(200);

    const result = await db.query<{ status: string }>(
      `SELECT status FROM progress WHERE user_id = $1 AND item_type = $2 AND item_slug = $3`,
      [userId, "lesson", "01-reliability/01-load-and-performance"],
    );
    expect(result.rows[0]?.status).toBe("in_progress");
  });
});
