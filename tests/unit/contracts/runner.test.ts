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
