import { describe, expect, it } from "vitest";
import { buildSubmissionRequest } from "@/lib/lab/buildSubmissionRequest";
import { graderVersion } from "@/lib/runner/grader";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";

const EXERCISE: ExerciseDefinition = {
  slug: "01-reliability/percentile-lab",
  language: "js",
  entry: "percentile",
  template: "export function percentile(values, p) {}\n",
  tests: [
    { id: "t1", call: { fn: "percentile", args: [[1, 2, 3], 50] }, assert: { type: "equals", value: 2 } },
    { id: "t2", call: { fn: "percentile", args: [[1, 2], 100] }, assert: { type: "equals", value: 2 } },
  ],
  timeoutMs: 3000,
  hints: [],
};

const REQUEST_TESTS: RunRequest["tests"] = [
  { id: "t1", args: [[1, 2, 3], 50], expected: 2 },
  { id: "t2", args: [[1, 2], 100], expected: 2 },
];

describe("buildSubmissionRequest", () => {
  it("maps a passing RunResult to a pass submission with full passed/total counts", () => {
    const result: RunResult = {
      result: "pass",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: true },
      ],
      logs: [],
      durationMs: 12,
    };

    expect(buildSubmissionRequest(EXERCISE, "export function percentile(){}", result, REQUEST_TESTS)).toEqual({
      exerciseSlug: "01-reliability/percentile-lab",
      language: "js",
      code: "export function percentile(){}",
      result: "pass",
      passedTests: 2,
      totalTests: 2,
      durationMs: 12,
      graderVersion,
    });
  });

  it("maps a failing RunResult to a fail submission counting only the tests that passed", () => {
    const result: RunResult = {
      result: "fail",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: false },
      ],
      logs: [],
      durationMs: 5,
    };

    const body = buildSubmissionRequest(EXERCISE, "code", result, REQUEST_TESTS);
    expect(body.result).toBe("fail");
    expect(body.passedTests).toBe(1);
    expect(body.totalTests).toBe(2);
  });

  it("maps a timeout RunResult to result:timeout with 0 passed tests", () => {
    const result: RunResult = { result: "timeout", logs: [], durationMs: 3000 };

    const body = buildSubmissionRequest(EXERCISE, "code", result, REQUEST_TESTS);
    expect(body.result).toBe("timeout");
    expect(body.passedTests).toBe(0);
    expect(body.totalTests).toBe(2);
    expect(body.durationMs).toBe(3000);
  });

  it("maps a runtime_error RunResult to result:error, falling back to exercise.tests.length when requestTests is empty", () => {
    const result: RunResult = { result: "error", error: "boom", logs: [], durationMs: 1 };

    const body = buildSubmissionRequest(EXERCISE, "code", result, []);
    expect(body.result).toBe("error");
    expect(body.passedTests).toBe(0);
    expect(body.totalTests).toBe(EXERCISE.tests.length);
  });

  it("carries the exercise's own language (sql) through unchanged", () => {
    const sqlExercise: ExerciseDefinition = { ...EXERCISE, language: "sql" };
    const result: RunResult = { result: "pass", perTest: [{ id: "t1", pass: true }], logs: [], durationMs: 4 };

    const body = buildSubmissionRequest(sqlExercise, "SELECT 1", result, [REQUEST_TESTS[0]]);
    expect(body.language).toBe("sql");
  });
});
