import { describe, expect, it } from "vitest";
import { adaptSqlRunResult } from "@/lib/lab/adaptSqlRunResult";
import type { SqlRunResult } from "@/lib/runner/sqlContracts";

describe("adaptSqlRunResult", () => {
  it("maps a pass result, JSON.stringify-ing each perTest.actual result set", () => {
    const sqlResult: SqlRunResult = {
      result: "pass",
      perTest: [{ id: "t1", pass: true, actual: { columns: ["id"], rows: [[1]] } }],
      durationMs: 12,
    };
    expect(adaptSqlRunResult(sqlResult)).toEqual({
      result: "pass",
      perTest: [{ id: "t1", pass: true, actual: JSON.stringify({ columns: ["id"], rows: [[1]] }), error: undefined }],
      logs: [],
      durationMs: 12,
    });
  });

  it("maps a fail result and drops sqlCompare's own diff summary (resultDiff.ts recomputes it)", () => {
    const sqlResult: SqlRunResult = {
      result: "fail",
      perTest: [
        {
          id: "t1",
          pass: false,
          actual: { columns: ["id"], rows: [[2]] },
          diff: "行数が一致しません: expected 1件, actual 1件",
        },
      ],
      durationMs: 5,
    };
    const adapted = adaptSqlRunResult(sqlResult);
    expect(adapted.result).toBe("fail");
    if (adapted.result === "fail" || adapted.result === "pass") {
      expect(adapted.perTest[0]).toEqual({
        id: "t1",
        pass: false,
        actual: JSON.stringify({ columns: ["id"], rows: [[2]] }),
        error: undefined,
      });
    }
  });

  it("leaves actual undefined (not the string 'undefined') when a test errored before producing a result set", () => {
    const sqlResult: SqlRunResult = {
      result: "fail",
      perTest: [{ id: "t1", pass: false, error: "no such table: users" }],
      durationMs: 3,
    };
    const adapted = adaptSqlRunResult(sqlResult);
    if (adapted.result === "fail" || adapted.result === "pass") {
      expect(adapted.perTest[0].actual).toBeUndefined();
      expect(adapted.perTest[0].error).toBe("no such table: users");
    }
  });

  it("maps an error result straight through with empty logs", () => {
    const sqlResult: SqlRunResult = { result: "error", error: "syntax error", durationMs: 7 };
    expect(adaptSqlRunResult(sqlResult)).toEqual({
      result: "error",
      error: "syntax error",
      logs: [],
      durationMs: 7,
    });
  });

  it("maps a timeout result straight through with empty logs", () => {
    const sqlResult: SqlRunResult = { result: "timeout", durationMs: 5000 };
    expect(adaptSqlRunResult(sqlResult)).toEqual({
      result: "timeout",
      logs: [],
      durationMs: 5000,
    });
  });
});
