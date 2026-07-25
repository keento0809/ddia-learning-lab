import type { RunResult } from "@/lib/contracts/runner";
import type { SqlRunResult } from "@/lib/runner/sqlContracts";

/**
 * `SqlRunResult`(lib/runner/sqlContracts、T-201)を`RunResult`(lib/contracts/runner、
 * JSランナー用、変更禁止)の形へ正規化する。
 *
 * これにより`ResultPanel.tsx`/`lib/lab/resultDiff.ts`/`lib/store/labStore.ts`/
 * `lib/lab/labStateMachine.ts`(いずれも`result: "pass"|"fail"|"timeout"|"error"`
 * という同一の判別子集合を前提にしている)をSQL演習でも一切変更せず再利用できる。
 * `SqlPerTestResult.actual`(`SqlResultSet`オブジェクト)は`RunPerTestResult.actual`
 * (文字列、harness.worker.tsのsafeStringify規約)に合わせて`JSON.stringify`する。
 * `resultDiff.ts`の`buildTestDiff`はこの文字列を`JSON.parse`で復元してから
 * `diffValues`(lib/runner/grader.ts、任意のJSON的値を再帰的に比較する汎用実装)に
 * 渡すため、`{columns,rows}`形の結果集合でも正しく差分表示できる。
 *
 * `SqlPerTestResult.diff`(sqlCompare.tsが生成する要約文)は捨てる
 * (`buildTestDiff`が独立に同等の差分を再計算するため、二重表示を避ける)。
 * SQLランナーはコンソールログを持たないため`logs`は常に空配列。
 */
export function adaptSqlRunResult(result: SqlRunResult): RunResult {
  switch (result.result) {
    case "pass":
    case "fail":
      return {
        result: result.result,
        perTest: result.perTest.map((t) => ({
          id: t.id,
          pass: t.pass,
          actual: t.actual !== undefined ? JSON.stringify(t.actual) : undefined,
          error: t.error,
        })),
        logs: [],
        durationMs: result.durationMs,
      };
    case "error":
      return { result: "error", error: result.error, logs: [], durationMs: result.durationMs };
    case "timeout":
      return { result: "timeout", logs: [], durationMs: result.durationMs };
  }
}
