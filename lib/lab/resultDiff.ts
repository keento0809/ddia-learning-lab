import { diffValues } from "@/lib/runner/grader";
import type { RunPerTestResult, RunRequest } from "@/lib/contracts/runner";

/**
 * 結果パネル(02§4.2「期待値/実際/差分表示」)向けに、実行済み`RunRequest.tests`
 * (期待値を保持している)と`RunResult.perTest`(実測値を文字列化した状態で保持)を
 * id突合せで対応付け、`lib/runner/grader.ts`の`diffValues`(既存実装、変更なし)を
 * 使って差分文字列を生成する。
 *
 * `RunPerTestResult.actual`は`JSON.stringify`済みの文字列(harness.worker.tsの
 * `safeStringify`)のため、比較のため`JSON.parse`で復元する。復元に失敗する値
 * (関数・循環参照など、そもそも構造比較できない)は文字列のまま比較する。
 */
export interface TestDiff {
  expected: unknown;
  actualParsed: unknown;
  diff: string;
}

function tryParseActual(actual: string | undefined): unknown {
  if (actual === undefined) return undefined;
  try {
    return JSON.parse(actual);
  } catch {
    return actual;
  }
}

/**
 * 結果パネルでの値表示用フォーマット。
 * 失敗→恒久対策: `JSON.stringify(undefined)`は`undefined`(JS値、文字列ではない)を
 * 返すため、Reactの子要素としては何も描画されず「実際の値: 」の欄が空欄になって
 * いた(qa-evaluatorが検出。テンプレート未実装コードが`undefined`を返す最頻出の
 * 失敗ケースで発生する)。`undefined`は明示的に文字列"undefined"として表示する。
 */
export function formatDisplayValue(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

export function buildTestDiff(
  perTest: RunPerTestResult,
  requestTests: RunRequest["tests"],
): TestDiff | null {
  if (perTest.pass) return null;
  const requestTest = requestTests.find((t) => t.id === perTest.id);
  if (!requestTest) return null;

  const actualParsed = tryParseActual(perTest.actual);
  return {
    expected: requestTest.expected,
    actualParsed,
    diff: diffValues(requestTest.expected, actualParsed),
  };
}
