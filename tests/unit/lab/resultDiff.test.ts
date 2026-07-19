import { describe, expect, it } from "vitest";
import { buildTestDiff, formatDisplayValue } from "@/lib/lab/resultDiff";
import type { RunRequest } from "@/lib/contracts/runner";

const REQUEST_TESTS: RunRequest["tests"] = [
  { id: "t1", args: [], expected: "v2" },
  { id: "t2", args: [], expected: { a: 1 } },
];

// T-108受入基準(5)「結果パネル...diff表示」
describe("buildTestDiff", () => {
  it("returns null for a passing test (nothing to diff)", () => {
    expect(buildTestDiff({ id: "t1", pass: true, actual: '"v2"' }, REQUEST_TESTS)).toBeNull();
  });

  it("returns null when the test id has no matching request test (defensive)", () => {
    expect(buildTestDiff({ id: "unknown", pass: false, actual: "1" }, REQUEST_TESTS)).toBeNull();
  });

  it("pairs a failed test's expected value with its actual value and produces a diff string", () => {
    const diff = buildTestDiff({ id: "t1", pass: false, actual: '"v1"' }, REQUEST_TESTS);
    expect(diff).not.toBeNull();
    expect(diff?.expected).toBe("v2");
    expect(diff?.actualParsed).toBe("v1");
    expect(diff?.diff).toContain("v2");
    expect(diff?.diff).toContain("v1");
  });

  it("parses a JSON-serialized object actual value back before diffing", () => {
    const diff = buildTestDiff({ id: "t2", pass: false, actual: '{"a":2}' }, REQUEST_TESTS);
    expect(diff?.actualParsed).toEqual({ a: 2 });
  });

  it("falls back to the raw string when actual isn't valid JSON", () => {
    const diff = buildTestDiff({ id: "t1", pass: false, actual: "not-json" }, REQUEST_TESTS);
    expect(diff?.actualParsed).toBe("not-json");
  });

  it("treats a missing actual (runtime exception in the user function) as undefined", () => {
    const diff = buildTestDiff({ id: "t1", pass: false, error: "boom" }, REQUEST_TESTS);
    expect(diff?.actualParsed).toBeUndefined();
  });
});

// 失敗→恒久対策: JSON.stringify(undefined)はundefined(JS値)を返しReactが何も
// 描画しないため、結果パネルの「実際の値」欄が空欄になっていた(qa-evaluatorが
// 未実装テンプレート実行という最頻出の失敗ケースで検出)。
describe("formatDisplayValue", () => {
  it("shows undefined explicitly as the string 'undefined' instead of rendering blank", () => {
    expect(formatDisplayValue(undefined)).toBe("undefined");
  });

  it("JSON-stringifies ordinary values", () => {
    expect(formatDisplayValue("v2")).toBe('"v2"');
    expect(formatDisplayValue(5)).toBe("5");
    expect(formatDisplayValue({ a: 1 })).toBe('{"a":1}');
    expect(formatDisplayValue(null)).toBe("null");
  });
});
