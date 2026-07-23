import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ADR-008(docs/design/09) §2・T-501受入基準(5): worker-appからservice binding
 * 経由でworker-apiのhealthが200を返すことを検証する。
 *
 * worker-api側は `wrangler deploy --dry-run` で実際にバンドルした本物のWorkerを
 * Miniflare(workerd)上で起動する(実バンドル・実bindingsを検証対象にするため)。
 * worker-app側は、service binding(`env.API.fetch`)でworker-apiへ委譲するだけの
 * 最小スタブとする(フォワーダの実実装・APIルート移設はT-502のスコープ)。
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const COMPATIBILITY_DATE = "2024-09-23";

describe("worker-app -> worker-api service binding", () => {
  let mf: Miniflare;
  let outDir: string;

  beforeAll(() => {
    // workerdのファイルシステムサンドボックスはrootPath(既定でcwd=repoRoot)の外を
    // 参照する".."を許可しないため、OSの/tmpではなくrepoRoot配下に出力する。
    outDir = mkdtempSync(path.join(repoRoot, ".tmp-worker-api-dryrun-"));
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
          // T-502失敗→恒久対策: `wrangler deploy --dry-run --outdir`が抽出した
          // Prisma(runtime="workerd")のquery compiler WASMファイルは、`wrangler dev`/
          // 実デプロイ時はwrangler自身がCompiledWasmモジュールとして自動認識するが、
          // ビルド済みディレクトリを直接Miniflareへ渡す本テストの構成では明示的な
          // modulesRulesが無いと解決できない("no matching module rules")。
          modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
          compatibilityDate: COMPATIBILITY_DATE,
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            AUTH_SECRET: "test-service-binding-secret",
            DATABASE_URL: "postgresql://ddia:ddia@localhost:5433/ddia_test?schema=public",
          },
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await mf?.dispose();
    rmSync(outDir, { recursive: true, force: true });
  });

  it("worker-appからservice binding経由でworker-apiのhealthが200を返す", async () => {
    const res = await mf.dispatchFetch("http://worker-app.local/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
