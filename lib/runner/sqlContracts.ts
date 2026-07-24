/**
 * sqlHarness.worker.ts ⇄ sqlRunner.ts(メインスレッド)間の postMessage コントラクト。
 * 参照設計: docs/design/02_詳細設計書.md §7.3(SQLランナー)
 *
 * JSランナー(lib/contracts/runner.ts)とは request/result の形が異なる
 * (setupSql投入→ユーザーSQL実行→事後SELECTでの結果集合比較、という§7.3固有の
 * フローのため)。lib/contracts/ 配下の型は変更禁止(CLAUDE.md)のため、
 * このコントラクトはT-201固有の型としてlib/runner/配下に置く。
 */

/** sql.jsが返す値の型(@types/sql.jsのSqlValueに合わせる)。 */
export type SqlValue = number | string | Uint8Array | null;

/** SELECT結果集合(列名+行の配列)。 */
export type SqlResultSet = {
  columns: string[];
  rows: SqlValue[][];
};

/** 02§7.3「順序無視/順序考慮を指定して比較」。 */
export type SqlComparisonMode = "ordered" | "unordered";

/**
 * 1件分の検証。`query`はユーザーSQL実行後に評価するSELECT。
 * クエリ系課題では通常ユーザーSQL自体の結果を、破壊的課題(UPDATE/DELETE)では
 * 事後SELECTの結果を検証する(02§7.3)。
 */
export type SqlTestCase = {
  id: string;
  query: string;
  expected: SqlResultSet;
  comparison: SqlComparisonMode;
};

/** メインスレッド → Worker。 */
export type SqlRunRequest = {
  /** スキーマ+シードデータ投入用SQL(02§7.3「setupSql」)。 */
  setupSql: string;
  /** 採点対象のユーザーSQL。 */
  userSql: string;
  tests: SqlTestCase[];
  timeoutMs: number;
};

export type SqlPerTestResult = {
  id: string;
  pass: boolean;
  actual?: SqlResultSet;
  diff?: string;
  error?: string;
};

/** Worker → メインスレッド。JSランナー(RunResult)と同様にresult種別ごとにフィールドが異なる。 */
export type SqlRunResult =
  | { result: "pass" | "fail"; perTest: SqlPerTestResult[]; durationMs: number }
  | { result: "error"; error: string; durationMs: number }
  | { result: "timeout"; durationMs: number };
