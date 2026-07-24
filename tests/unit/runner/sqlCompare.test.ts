import { describe, expect, it } from "vitest";
import { compareResultSets } from "@/lib/runner/sqlCompare";
import type { SqlResultSet } from "@/lib/runner/sqlContracts";

function rs(columns: string[], rows: SqlResultSet["rows"]): SqlResultSet {
  return { columns, rows };
}

describe("compareResultSets: 順序考慮(ordered)", () => {
  it("passes when columns and rows match exactly in order", () => {
    const expected = rs(["id", "name"], [[1, "a"], [2, "b"]]);
    const actual = rs(["id", "name"], [[1, "a"], [2, "b"]]);
    expect(compareResultSets(expected, actual, "ordered")).toEqual({ pass: true });
  });

  it("fails when row order differs", () => {
    const expected = rs(["id"], [[1], [2]]);
    const actual = rs(["id"], [[2], [1]]);
    const outcome = compareResultSets(expected, actual, "ordered");
    expect(outcome.pass).toBe(false);
    expect(outcome.diff).toBeDefined();
  });

  it("fails when row counts differ", () => {
    const expected = rs(["id"], [[1], [2]]);
    const actual = rs(["id"], [[1]]);
    expect(compareResultSets(expected, actual, "ordered").pass).toBe(false);
  });

  it("fails when column names differ", () => {
    const expected = rs(["id"], [[1]]);
    const actual = rs(["identifier"], [[1]]);
    expect(compareResultSets(expected, actual, "ordered").pass).toBe(false);
  });
});

describe("compareResultSets: 順序無視(unordered)", () => {
  it("passes when the same rows appear in a different order", () => {
    const expected = rs(["id"], [[1], [2], [3]]);
    const actual = rs(["id"], [[3], [1], [2]]);
    expect(compareResultSets(expected, actual, "unordered")).toEqual({ pass: true });
  });

  it("respects duplicate row counts (multiset, not set)", () => {
    const expected = rs(["id"], [[1], [1], [2]]);
    const actual = rs(["id"], [[1], [2], [2]]);
    expect(compareResultSets(expected, actual, "unordered").pass).toBe(false);
  });

  it("fails when the row contents differ regardless of order", () => {
    const expected = rs(["id"], [[1], [2]]);
    const actual = rs(["id"], [[1], [3]]);
    expect(compareResultSets(expected, actual, "unordered").pass).toBe(false);
  });
});

describe("compareResultSets: 0行の結果(sql.jsがcolumnsを返さないケース)", () => {
  it("passes when both expected and actual have zero rows, even if actual has no column info", () => {
    const expected = rs(["id"], []);
    const actual = rs([], []);
    expect(compareResultSets(expected, actual, "ordered")).toEqual({ pass: true });
  });

  it("fails when expected has rows but actual is empty with no column info", () => {
    const expected = rs(["id"], [[1]]);
    const actual = rs([], []);
    expect(compareResultSets(expected, actual, "ordered").pass).toBe(false);
  });
});
