import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { RunRequest } from "@/lib/contracts/runner";

/**
 * `ExerciseDefinition.tests`(02§5.3、equals/deepEquals/oneOf/matches/property)を
 * `RunRequest.tests`(02§7.1、{id,args,expected}による単純deepEquals)へ変換する。
 *
 * **既知の制約(設計との差異)**: `harness.worker.ts`(T-107a)/`RunRequestSchema`
 * (T-010,契約のため変更禁止)は現時点で `expected` との単純deepEquals判定のみを
 * 実装しており、`lib/runner/grader.ts`(T-107b、oneOf/matches/property/diff生成を
 * 実装済み)への配線はT-107c決定事項ログで「本タスクでは着手しなかった」と
 * 明記されている未解決ギャップである(contracts変更が必要になるため)。
 * このため本関数は`equals`/`deepEquals`のテストケースのみをサポートし、
 * 対応できないテストケース(oneOf/matches/property)が含まれる演習を渡された
 * 場合は、合否を偽装せず`UnsupportedExerciseTestCaseError`を投げる。
 */
export class UnsupportedExerciseTestCaseError extends Error {
  constructor(public readonly unsupportedTestIds: string[]) {
    super(
      `現在のRunner統合ではoneOf/matches/property形式のテストは採点できません: ${unsupportedTestIds.join(", ")}`,
    );
    this.name = "UnsupportedExerciseTestCaseError";
  }
}

export function buildRunRequest(exercise: ExerciseDefinition, code: string): RunRequest {
  const unsupported: string[] = [];

  const tests: RunRequest["tests"] = [];
  for (const testCase of exercise.tests) {
    if (!("call" in testCase)) {
      unsupported.push(testCase.id);
      continue;
    }
    if (testCase.assert.type !== "equals" && testCase.assert.type !== "deepEquals") {
      unsupported.push(testCase.id);
      continue;
    }
    tests.push({ id: testCase.id, args: testCase.call.args, expected: testCase.assert.value });
  }

  if (unsupported.length > 0) {
    throw new UnsupportedExerciseTestCaseError(unsupported);
  }

  return { code, entry: exercise.entry, tests, timeoutMs: exercise.timeoutMs };
}
