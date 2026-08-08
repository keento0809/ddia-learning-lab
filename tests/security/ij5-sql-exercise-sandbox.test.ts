import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-703 IJ-5(docs/design/11_ADR-011 §3.3)。SQL演習(T-201): sql.jsはブラウザ内
 * なので影響はローカルDBのみ。ただしsetupSqlへのユーザー入力混入経路を確認する。
 *
 * IJ-4で$queryRaw/$executeRaw/queryRawUnsafe/executeRawUnsafeがリポジトリ全体に
 * 存在しないことを確認済み(=サーバ側でSQLを実行するコード自体が存在しない)。
 * 本テストはそれを補完し、サーバ側コード(workers/api/**, app/api/**, lib/db.ts,
 * prisma/**)がsetupSql/userSql/sql.jsという概念に一切触れていないこと
 * (=SQL演習の実行が完全にクライアントサイドのsql.js(ブラウザ内WASM SQLite、
 * lib/runner/sqlHarness.worker.ts)に閉じており、サーバへ到達する経路が
 * 存在しないこと)を静的に確認する。
 */
function listFiles(dir: string, extensions: string[]): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [fullPath] : [];
  });
}

describe("IJ-5: SQL演習(sql.js)のサーバ非到達性", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const serverDirs = ["workers/api/src", "app/api", "lib/db.ts", "prisma"];

  it("サーバ側コード(worker-api・Next.js Route Handler・DB層)はsetupSql/userSql/sql.jsを一切参照しない", () => {
    const offenders: string[] = [];
    for (const target of serverDirs) {
      const fullTarget = path.join(repoRoot, target);
      const files = fullTarget.endsWith(".ts") ? [fullTarget] : listFiles(fullTarget, [".ts", ".tsx"]);
      for (const file of files) {
        let source: string;
        try {
          source = readFileSync(file, "utf-8");
        } catch {
          continue;
        }
        if (/setupSql|userSql|sql\.js|sqljs/i.test(source)) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sql.jsのWASMバイナリはbuild時にpublic/generatedへコピーされる同一オリジンの静的アセットであり、外部CDNから読み込まれない", () => {
    const source = readFileSync(path.join(repoRoot, "lib/runner/sqlHarness.worker.ts"), "utf-8");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toMatch(/\/generated\//);
  });

  it("sqlHarness.worker.tsはSQL実行後、in-memoryのDBインスタンスを必ずclose()する(リソース解放、finally節)", () => {
    const source = readFileSync(path.join(repoRoot, "lib/runner/sqlHarness.worker.ts"), "utf-8");
    expect(source).toMatch(/finally/);
    expect(source).toMatch(/\.close\(\)/);
  });
});
