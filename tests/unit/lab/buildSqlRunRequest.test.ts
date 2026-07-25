import { describe, expect, it } from "vitest";
import { buildSqlRunRequest, UnsupportedSqlExerciseTestCaseError } from "@/lib/lab/buildSqlRunRequest";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";

const BASE: ExerciseDefinition = {
  slug: "01-reliability/sql-lab",
  language: "sql",
  entry: "CREATE TABLE users (id INTEGER PRIMARY KEY, active INTEGER NOT NULL);",
  template: "-- write DELETE here\n",
  tests: [
    {
      id: "t1",
      call: { fn: "SELECT id FROM users ORDER BY id", args: [] },
      assert: { type: "equals", value: { columns: ["id"], rows: [[2]] } },
    },
  ],
  timeoutMs: 3000,
  hints: [],
};

describe("buildSqlRunRequest", () => {
  it("maps entry to setupSql, call.fn to the verification query, and assert.value to the expected result set", () => {
    const request = buildSqlRunRequest(BASE, "DELETE FROM users WHERE id = 1;");
    expect(request).toEqual({
      setupSql: "CREATE TABLE users (id INTEGER PRIMARY KEY, active INTEGER NOT NULL);",
      userSql: "DELETE FROM users WHERE id = 1;",
      tests: [
        {
          id: "t1",
          query: "SELECT id FROM users ORDER BY id",
          expected: { columns: ["id"], rows: [[2]] },
          comparison: "ordered",
        },
      ],
      timeoutMs: 3000,
    });
  });

  it("accepts deepEquals assert test cases the same way as equals", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [
        {
          id: "t1",
          call: { fn: "SELECT 1", args: [] },
          assert: { type: "deepEquals", value: { columns: ["1"], rows: [[1]] } },
        },
      ],
    };
    const request = buildSqlRunRequest(exercise, "SELECT 1;");
    expect(request.tests).toEqual([
      { id: "t1", query: "SELECT 1", expected: { columns: ["1"], rows: [[1]] }, comparison: "ordered" },
    ]);
  });

  it("throws UnsupportedSqlExerciseTestCaseError for oneOf assert test cases", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [{ id: "t1", call: { fn: "SELECT 1", args: [] }, assert: { type: "oneOf", value: [1, 2] } }],
    };
    expect(() => buildSqlRunRequest(exercise, "code")).toThrow(UnsupportedSqlExerciseTestCaseError);
  });

  it("throws UnsupportedSqlExerciseTestCaseError for property test cases", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [
        {
          id: "t1",
          name: { ja: "プロパティ", en: "property" },
          kind: "property",
          check: "someCheck()",
        },
      ],
    };
    expect(() => buildSqlRunRequest(exercise, "code")).toThrow(UnsupportedSqlExerciseTestCaseError);
  });

  it("lists every unsupported test id in the error, not just the first", () => {
    const exercise: ExerciseDefinition = {
      ...BASE,
      tests: [
        { id: "bad1", call: { fn: "SELECT 1", args: [] }, assert: { type: "oneOf", value: [1] } },
        { id: "ok", call: { fn: "SELECT 1", args: [] }, assert: { type: "equals", value: { columns: [], rows: [] } } },
        { id: "bad2", call: { fn: "SELECT 1", args: [] }, assert: { type: "matches", value: "x" } },
      ],
    };
    try {
      buildSqlRunRequest(exercise, "code");
      expect.fail("expected buildSqlRunRequest to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedSqlExerciseTestCaseError);
      expect((e as InstanceType<typeof UnsupportedSqlExerciseTestCaseError>).unsupportedTestIds).toEqual([
        "bad1",
        "bad2",
      ]);
    }
  });
});
