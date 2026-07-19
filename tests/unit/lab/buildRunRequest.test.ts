import { describe, expect, it } from "vitest";
import { buildRunRequest, UnsupportedExerciseTestCaseError } from "@/lib/lab/buildRunRequest";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";

const BASE: ExerciseDefinition = {
  slug: "01-reliability/percentile-lab",
  language: "js",
  entry: "percentile",
  template: "export function percentile(values, p) {}\n",
  tests: [
    {
      id: "t1",
      call: { fn: "percentile", args: [[1, 2, 3, 4, 5], 50] },
      assert: { type: "equals", value: 3 },
    },
    {
      id: "t2",
      call: { fn: "percentile", args: [[1, 2], 100] },
      assert: { type: "deepEquals", value: 2 },
    },
  ],
  timeoutMs: 3000,
  hints: [],
};

describe("buildRunRequest", () => {
  it("converts equals/deepEquals assert test cases into RunRequest.tests", () => {
    const request = buildRunRequest(BASE, "code");
    expect(request).toEqual({
      code: "code",
      entry: "percentile",
      tests: [
        { id: "t1", args: [[1, 2, 3, 4, 5], 50], expected: 3 },
        { id: "t2", args: [[1, 2], 100], expected: 2 },
      ],
      timeoutMs: 3000,
    });
  });

  it("throws UnsupportedExerciseTestCaseError for oneOf assert test cases", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [{ id: "t1", call: { fn: "percentile", args: [] }, assert: { type: "oneOf", value: [1, 2] } }],
    };
    expect(() => buildRunRequest(exercise, "code")).toThrow(UnsupportedExerciseTestCaseError);
  });

  it("throws UnsupportedExerciseTestCaseError for matches assert test cases", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [{ id: "t1", call: { fn: "percentile", args: [] }, assert: { type: "matches", value: "^a" } }],
    };
    expect(() => buildRunRequest(exercise, "code")).toThrow(UnsupportedExerciseTestCaseError);
  });

  it("throws UnsupportedExerciseTestCaseError for property test cases", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [
        {
          id: "t1",
          name: { ja: "プロパティ", en: "property" },
          kind: "property",
          check: "moveRatioNear(1/4, 0.15)",
        },
      ],
    };
    expect(() => buildRunRequest(exercise, "code")).toThrow(UnsupportedExerciseTestCaseError);
  });

  it("lists every unsupported test id in the error, not just the first", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [
        { id: "bad1", call: { fn: "f", args: [] }, assert: { type: "oneOf", value: [1] } },
        { id: "ok", call: { fn: "f", args: [] }, assert: { type: "equals", value: 1 } },
        { id: "bad2", call: { fn: "f", args: [] }, assert: { type: "matches", value: "x" } },
      ],
    };
    try {
      buildRunRequest(exercise, "code");
      expect.fail("expected buildRunRequest to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedExerciseTestCaseError);
      expect((e as InstanceType<typeof UnsupportedExerciseTestCaseError>).unsupportedTestIds).toEqual([
        "bad1",
        "bad2",
      ]);
    }
  });
});
