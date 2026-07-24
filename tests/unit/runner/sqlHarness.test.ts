import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { runSqlHarness, type SqlHarnessDeps } from "@/lib/runner/sqlHarness.worker";
import type { SqlRunRequest } from "@/lib/runner/sqlContracts";

/**
 * sql.jsはNode上でも(パッケージ既定のfs解決で)そのまま動作するため、モックせず
 * 実sql.jsに対して実行する(CLAUDE.md規則3: モックで「実装したことにする」の禁止)。
 * ブラウザWorker内でのロード自体(同一オリジン配信のWASM資産経路)は
 * tests/e2e/sqlRunner.spec.ts で実ブラウザ検証する。
 */
const deps: SqlHarnessDeps = { loadSqlJs: () => initSqlJs() };

const SETUP_SQL = `
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);
INSERT INTO users (id, name, active) VALUES (1, 'alice', 0), (2, 'bob', 1), (3, 'carol', 1);
`;

function baseRequest(overrides: Partial<SqlRunRequest> = {}): SqlRunRequest {
  return {
    setupSql: SETUP_SQL,
    userSql: "SELECT 1;",
    tests: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

describe("runSqlHarness: 正常系(setupSql投入→ユーザーSQL実行→結果集合比較)", () => {
  it("passes when the query result matches the expected result set", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "SELECT 1;",
        tests: [
          {
            id: "t1",
            query: "SELECT id, name FROM users ORDER BY id",
            expected: {
              columns: ["id", "name"],
              rows: [
                [1, "alice"],
                [2, "bob"],
                [3, "carol"],
              ],
            },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("pass");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest).toEqual([
        expect.objectContaining({ id: "t1", pass: true }),
      ]);
    }
  });
});

describe("runSqlHarness: 構文エラー", () => {
  it("returns an error result when userSql is not valid SQL", async () => {
    const result = await runSqlHarness(baseRequest({ userSql: "DELEET FROM users;" }), deps);

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("syntax error");
    }
  });
});

describe("runSqlHarness: 期待不一致", () => {
  it("fails the test case when the actual result set does not match expected", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "SELECT 1;",
        tests: [
          {
            id: "t1",
            query: "SELECT id FROM users ORDER BY id",
            expected: { columns: ["id"], rows: [[1], [2]] },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0].pass).toBe(false);
      expect(result.perTest[0].diff).toBeDefined();
    }
  });
});

describe("runSqlHarness: 順序無視比較", () => {
  it("passes an unordered comparison even when row order differs from expected", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "SELECT 1;",
        tests: [
          {
            id: "t1",
            query: "SELECT id FROM users ORDER BY id DESC",
            expected: { columns: ["id"], rows: [[1], [2], [3]] },
            comparison: "unordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("pass");
  });

  it("still fails an ordered comparison for the same reversed rows", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "SELECT 1;",
        tests: [
          {
            id: "t1",
            query: "SELECT id FROM users ORDER BY id DESC",
            expected: { columns: ["id"], rows: [[1], [2], [3]] },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("fail");
  });
});

describe("runSqlHarness: 破壊的課題(UPDATE/DELETE)の事後SELECT検証", () => {
  it("verifies table state via a post-mutation SELECT after a DELETE", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "DELETE FROM users WHERE active = 0;",
        tests: [
          {
            id: "t1",
            query: "SELECT id, name FROM users ORDER BY id",
            expected: {
              columns: ["id", "name"],
              rows: [
                [2, "bob"],
                [3, "carol"],
              ],
            },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("pass");
  });

  it("verifies table state via a post-mutation SELECT after an UPDATE", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "UPDATE users SET active = 1 WHERE id = 1;",
        tests: [
          {
            id: "t1",
            query: "SELECT active FROM users WHERE id = 1",
            expected: { columns: ["active"], rows: [[1]] },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("pass");
  });

  it("fails the post-mutation check when the DELETE removed the wrong rows", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "DELETE FROM users WHERE id = 3;",
        tests: [
          {
            id: "t1",
            query: "SELECT id FROM users ORDER BY id",
            expected: { columns: ["id"], rows: [[2], [3]] },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("fail");
  });

  it("handles a verification query that itself returns zero rows (sql.js omits column info in that case)", async () => {
    const result = await runSqlHarness(
      baseRequest({
        userSql: "DELETE FROM users;",
        tests: [
          {
            id: "t1",
            query: "SELECT id FROM users",
            expected: { columns: ["id"], rows: [] },
            comparison: "ordered",
          },
        ],
      }),
      deps,
    );

    expect(result.result).toBe("pass");
  });
});

describe("runSqlHarness: setupSql自体の失敗", () => {
  it("returns an error result if setupSql fails (surfaced distinctly from userSql errors)", async () => {
    const result = await runSqlHarness(
      baseRequest({ setupSql: "NOT VALID SQL;", userSql: "SELECT 1;" }),
      deps,
    );

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("セットアップSQL");
    }
  });
});
