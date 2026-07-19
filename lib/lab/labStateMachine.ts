import type { RunResult } from "@/lib/contracts/runner";

/**
 * S-06 演習ページ(T-108, 02§4.2)の実行状態機械。
 * `idle → validating → running → grading → passed|failed|timeout|runtime_error`
 * (どの状態からも `edit` で `idle` に戻れる、結果は保持したまま)。
 *
 * 「validating」は harness.worker.ts(T-107a)が内部でも行う禁止トークン検査
 * (`checkForbiddenTokens`)をメインスレッド側で先に実行するための状態。
 * Worker起動前に短絡させる目的の追加チェックであり、harness側のチェックを
 * 置き換えるものではない(harness側は変更禁止のcontracts/既存実装)。
 */
export type LabStatus =
  | "idle"
  | "validating"
  | "running"
  | "grading"
  | "passed"
  | "failed"
  | "timeout"
  | "runtime_error";

export type LabOutcome = "passed" | "failed" | "timeout" | "runtime_error";

export type LabEvent =
  | { type: "edit" }
  | { type: "run" }
  | { type: "validation_failed" }
  | { type: "validation_passed" }
  | { type: "worker_result" }
  | { type: "graded"; outcome: LabOutcome };

/** RunResult(harness/jsRunnerの返却)をこの状態機械の最終状態へ写像する。 */
export function outcomeFromRunResult(result: RunResult): LabOutcome {
  switch (result.result) {
    case "pass":
      return "passed";
    case "fail":
      return "failed";
    case "timeout":
      return "timeout";
    case "error":
      return "runtime_error";
  }
}

/**
 * 純粋な状態遷移関数。定義されていない{state, event}の組は状態を変えない
 * (無視するのではなく「その状態ではそのイベントは無効」という設計上のガード)。
 *
 * 失敗→恒久対策: 当初`run`は`idle`からのみ有効とし、`passed/failed/timeout/
 * runtime_error`から再実行するには一度`edit`を経由する設計だった。
 * qa-evaluatorの実ブラウザ検証で「結果確定後は"実行"ボタンが見た目は有効な
 * ままサイレントno-opになる(コードを一切変更していないと再実行できず、
 * ヒント段階開放にすら到達できない)」という重大な操作性欠陥を検出したため、
 * 終端状態(passed/failed/timeout/runtime_error)からも`run`を有効にした
 * (validating/running/grading進行中のみ`run`を無視する「実行中は多重実行不可」
 * というガードに絞った)。
 */
export function labTransition(state: LabStatus, event: LabEvent): LabStatus {
  if (event.type === "edit") return "idle";

  switch (state) {
    case "idle":
    case "passed":
    case "failed":
    case "timeout":
    case "runtime_error":
      return event.type === "run" ? "validating" : state;
    case "validating":
      if (event.type === "validation_failed") return "runtime_error";
      if (event.type === "validation_passed") return "running";
      return state;
    case "running":
      return event.type === "worker_result" ? "grading" : state;
    case "grading":
      return event.type === "graded" ? event.outcome : state;
  }
}
