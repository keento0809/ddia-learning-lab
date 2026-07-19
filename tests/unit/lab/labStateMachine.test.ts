import { describe, expect, it } from "vitest";
import {
  labTransition,
  outcomeFromRunResult,
  type LabEvent,
  type LabOutcome,
  type LabStatus,
} from "@/lib/lab/labStateMachine";
import type { RunResult } from "@/lib/contracts/runner";

/**
 * T-108受入基準(4)「状態機械の単体テスト(全遷移)」。
 * 8状態 × 6イベント種別(gradedは4outcome分岐)の組み合わせを全て網羅する。
 * 定義されていない組み合わせは「状態を変えない(無視)」ことも仕様として検証する。
 */
const ALL_STATES: LabStatus[] = [
  "idle",
  "validating",
  "running",
  "grading",
  "passed",
  "failed",
  "timeout",
  "runtime_error",
];

const ALL_OUTCOMES: LabOutcome[] = ["passed", "failed", "timeout", "runtime_error"];

describe("labTransition", () => {
  it("edit always returns to idle, from every state", () => {
    for (const state of ALL_STATES) {
      expect(labTransition(state, { type: "edit" })).toBe("idle");
    }
  });

  const RUNNABLE_STATES: LabStatus[] = ["idle", "passed", "failed", "timeout", "runtime_error"];
  const BUSY_STATES: LabStatus[] = ["validating", "running", "grading"];

  it("run moves idle or any terminal state (passed/failed/timeout/runtime_error) -> validating", () => {
    for (const state of RUNNABLE_STATES) {
      expect(labTransition(state, { type: "run" })).toBe("validating");
    }
  });

  it("run is a no-op while a previous run is still in progress (validating/running/grading)", () => {
    // 失敗→恒久対策: qa-evaluatorが「結果確定後は"実行"ボタンが見た目は有効な
    // ままサイレントno-opになる」を検出したため、re-runを許可する対象を
    // 終端状態(上のテスト)に限定し、実行中の多重実行のみをここで防ぐ。
    for (const state of BUSY_STATES) {
      expect(labTransition(state, { type: "run" })).toBe(state);
    }
  });

  it("validation_failed moves validating -> runtime_error, and is a no-op elsewhere", () => {
    for (const state of ALL_STATES) {
      const next = labTransition(state, { type: "validation_failed" });
      expect(next).toBe(state === "validating" ? "runtime_error" : state);
    }
  });

  it("validation_passed moves validating -> running, and is a no-op elsewhere", () => {
    for (const state of ALL_STATES) {
      const next = labTransition(state, { type: "validation_passed" });
      expect(next).toBe(state === "validating" ? "running" : state);
    }
  });

  it("worker_result moves running -> grading, and is a no-op elsewhere", () => {
    for (const state of ALL_STATES) {
      const next = labTransition(state, { type: "worker_result" });
      expect(next).toBe(state === "running" ? "grading" : state);
    }
  });

  it("graded moves grading -> the carried outcome (all 4 outcomes), and is a no-op elsewhere", () => {
    for (const outcome of ALL_OUTCOMES) {
      for (const state of ALL_STATES) {
        const event: LabEvent = { type: "graded", outcome };
        const next = labTransition(state, event);
        expect(next).toBe(state === "grading" ? outcome : state);
      }
    }
  });

  it("walks the full idle -> validating -> running -> grading -> passed happy path", () => {
    let state: LabStatus = "idle";
    state = labTransition(state, { type: "run" });
    expect(state).toBe("validating");
    state = labTransition(state, { type: "validation_passed" });
    expect(state).toBe("running");
    state = labTransition(state, { type: "worker_result" });
    expect(state).toBe("grading");
    state = labTransition(state, { type: "graded", outcome: "passed" });
    expect(state).toBe("passed");
  });

  it("walks the validation-failure path directly to runtime_error", () => {
    let state: LabStatus = "idle";
    state = labTransition(state, { type: "run" });
    state = labTransition(state, { type: "validation_failed" });
    expect(state).toBe("runtime_error");
  });

  it("returns to idle via edit from any terminal state, preserving no extra state itself", () => {
    for (const outcome of ALL_OUTCOMES) {
      expect(labTransition(outcome, { type: "edit" })).toBe("idle");
    }
  });
});

describe("outcomeFromRunResult", () => {
  it("maps a passing RunResult to 'passed'", () => {
    const result: RunResult = { result: "pass", perTest: [], logs: [], durationMs: 5 };
    expect(outcomeFromRunResult(result)).toBe("passed");
  });

  it("maps a failing RunResult to 'failed'", () => {
    const result: RunResult = { result: "fail", perTest: [], logs: [], durationMs: 5 };
    expect(outcomeFromRunResult(result)).toBe("failed");
  });

  it("maps a timeout RunResult to 'timeout'", () => {
    const result: RunResult = { result: "timeout", logs: [], durationMs: 5000 };
    expect(outcomeFromRunResult(result)).toBe("timeout");
  });

  it("maps an error RunResult to 'runtime_error'", () => {
    const result: RunResult = { result: "error", error: "boom", logs: [], durationMs: 1 };
    expect(outcomeFromRunResult(result)).toBe("runtime_error");
  });
});
