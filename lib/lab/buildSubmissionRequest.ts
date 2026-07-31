import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { PostSubmissionRequest, SubmissionResult } from "@/lib/contracts/api";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import { graderVersion } from "@/lib/runner/grader";

const RESULT_MAP: Record<RunResult["result"], SubmissionResult> = {
  pass: "pass",
  fail: "fail",
  timeout: "timeout",
  error: "error",
};

/**
 * `RunResult`(採点Workerの結果、lib/contracts/runner)から
 * `POST /api/submissions`のリクエストボディ(02§3.1)を組み立てる(T-108e)。
 *
 * `passedTests`/`totalTests`はpass/failのみ`perTest`から数え、timeout/errorは
 * テストが1件も実行されていないため0件合格とする。`totalTests`は本来
 * `requestTests`(実際にWorkerへ送ったテスト定義、常にexercise.tests全件)から
 * 数えるが、`LabWorkspace.tsx`の想定外例外パス(catchブロック、requestTestsが
 * 空配列になる)でも0件にならないよう`exercise.tests.length`にフォールバックする。
 */
export function buildSubmissionRequest(
  exercise: ExerciseDefinition,
  code: string,
  result: RunResult,
  requestTests: RunRequest["tests"],
): PostSubmissionRequest {
  const totalTests = requestTests.length > 0 ? requestTests.length : exercise.tests.length;
  const passedTests =
    result.result === "pass" || result.result === "fail"
      ? result.perTest.filter((test) => test.pass).length
      : 0;

  return {
    exerciseSlug: exercise.slug,
    language: exercise.language,
    code,
    result: RESULT_MAP[result.result],
    passedTests,
    totalTests,
    durationMs: result.durationMs,
    graderVersion,
  };
}
