import { describe, expect, it } from "vitest";
import { RunRequestSchema, RunResultSchema } from "@/lib/contracts/runner";

describe("RunRequestSchema", () => {
  it("parses a valid run request", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put(k, v) { return v; }",
      entry: "put",
      tests: [{ id: "t1", args: ["a", 1], expected: 1 }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive timeoutMs", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put() {}",
      entry: "put",
      tests: [],
      timeoutMs: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional per-test fn that differs from entry (02§5.3 call.fn dispatch)", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put(k, v) {} export function get(k) {}",
      entry: "put",
      tests: [{ id: "t1", fn: "get", args: ["a"], expected: 1 }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("still parses tests without fn (backward-compatible default to entry)", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put(k, v) { return v; }",
      entry: "put",
      tests: [{ id: "t1", args: ["a", 1], expected: 1 }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string fn", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put() {}",
      entry: "put",
      tests: [{ id: "t1", fn: "", args: [], expected: 1 }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional per-test assert carrying oneOf (02§7.2, verify/grader-assert-wiring)", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function pickStatus(code) { return code < 300 ? 'ok' : 'error'; }",
      entry: "pickStatus",
      tests: [
        {
          id: "t1",
          args: [200],
          expected: ["ok", "created"],
          assert: { type: "oneOf", value: ["ok", "created"] },
        },
      ],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional per-test assert carrying matches (02§7.2, verify/grader-assert-wiring)", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function formatId(n) { return `user-${n}`; }",
      entry: "formatId",
      tests: [
        {
          id: "t1",
          args: [42],
          expected: "^user-\\d+$",
          assert: { type: "matches", value: "^user-\\d+$" },
        },
      ],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("still parses tests without assert (backward-compatible fallback to expected)", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put(k, v) { return v; }",
      entry: "put",
      tests: [{ id: "t1", args: ["a", 1], expected: 1 }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an assert with an unknown discriminant type", () => {
    const result = RunRequestSchema.safeParse({
      code: "export function put() {}",
      entry: "put",
      tests: [{ id: "t1", args: [], expected: 1, assert: { type: "greaterThan", value: 1 } }],
      timeoutMs: 3000,
    });
    expect(result.success).toBe(false);
  });
});

describe("RunResultSchema", () => {
  it("parses a passing result with perTest details", () => {
    const result = RunResultSchema.safeParse({
      result: "pass",
      perTest: [{ id: "t1", pass: true }],
      logs: [{ level: "log", args: ["ok"] }],
      durationMs: 12,
    });
    expect(result.success).toBe(true);
  });

  it("parses a timeout result without perTest", () => {
    const result = RunResultSchema.safeParse({
      result: "timeout",
      logs: [],
      durationMs: 5500,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown result discriminant", () => {
    const result = RunResultSchema.safeParse({
      result: "aborted",
      logs: [],
      durationMs: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pass result missing perTest", () => {
    const result = RunResultSchema.safeParse({
      result: "pass",
      logs: [],
      durationMs: 10,
    });
    expect(result.success).toBe(false);
  });
});
