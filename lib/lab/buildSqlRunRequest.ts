import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { SqlRunRequest, SqlResultSet } from "@/lib/runner/sqlContracts";

/**
 * `ExerciseDefinition`(language: "sql")を`SqlRunRequest`(lib/runner/sqlContracts、
 * T-201)へ変換する。`lib/lab/buildRunRequest.ts`(JS版)と対の役割。
 *
 * **既知の制約(設計との差異)**: `ExerciseDefinitionSchema`(lib/contracts、
 * 変更禁止)には02§7.3が要求する`setupSql`/比較モード(順序無視/順序考慮)用の
 * 専用フィールドが無い。同スキーマの「language別にentry/採点方式が変わる」
 * というコメント(§7.1 JS / §7.3 SQL)を根拠に、SQL演習では既存フィールドを
 * 次のように読み替える(T-102/T-109の決定事項ログにある「フィールド不在は
 * 都度ワークアラウンドを明記し、真に不可能な場合のみ停止する」という前例を踏襲):
 * - `entry`(本来は採点対象関数名) → セットアップSQL(スキーマ+シード投入)
 * - `call.fn`(本来は関数名) → 検証用SELECT文
 * - `call.args` → SQL側では未使用(空配列固定)
 * - `assert.value` → 期待する結果集合(`SqlResultSet`)
 * - 比較モード → contractsに対応フィールドが無いため常に"ordered"固定
 *   (順序無視比較が必要な演習は本統合では表現できない、既知の制約)
 *
 * JS版と同様、equals/deepEquals以外(oneOf/matches/property)のテストケースは
 * 採点方式が定義されていないため、合否を偽装せずエラーを投げる。
 */
export class UnsupportedSqlExerciseTestCaseError extends Error {
  constructor(public readonly unsupportedTestIds: string[]) {
    super(
      `現在のSQL Runner統合ではoneOf/matches/property形式のテストは採点できません: ${unsupportedTestIds.join(", ")}`,
    );
    this.name = "UnsupportedSqlExerciseTestCaseError";
  }
}

export function buildSqlRunRequest(exercise: ExerciseDefinition, userSql: string): SqlRunRequest {
  const unsupported: string[] = [];

  const tests: SqlRunRequest["tests"] = [];
  for (const testCase of exercise.tests) {
    if (!("call" in testCase) || (testCase.assert.type !== "equals" && testCase.assert.type !== "deepEquals")) {
      unsupported.push(testCase.id);
      continue;
    }
    tests.push({
      id: testCase.id,
      query: testCase.call.fn,
      expected: testCase.assert.value as SqlResultSet,
      comparison: "ordered",
    });
  }

  if (unsupported.length > 0) {
    throw new UnsupportedSqlExerciseTestCaseError(unsupported);
  }

  return { setupSql: exercise.entry, userSql, tests, timeoutMs: exercise.timeoutMs };
}
