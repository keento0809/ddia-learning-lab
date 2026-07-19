import { describe, expect, it } from "vitest";
import type { ExerciseAssert, ExerciseTestCase } from "@/lib/contracts/exercise";
import {
  CheckExpressionError,
  CircularReferenceError,
  diffValues,
  estimateComplexity,
  evaluateAssert,
  evaluateProperty,
  gradeExercise,
  gradeTestCase,
  graderVersion,
  hasCircularReference,
  MAX_DIFF_DEPTH,
  parseCheckExpression,
  structuralEquals,
  type GraderDeps,
  type PropertyHelperRegistry,
} from "@/lib/runner/grader";

function buildDeepArray(depth: number, leaf: unknown): unknown {
  let value: unknown = leaf;
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}

function buildDeepObject(depth: number, leaf: unknown): unknown {
  let value: unknown = leaf;
  for (let i = 0; i < depth; i++) value = { next: value };
  return value;
}

describe("graderVersion", () => {
  it("is a semver string", () => {
    expect(graderVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("evaluateAssert: エッジケーステーブル駆動テスト", () => {
  const cases: {
    assertType: string;
    edgeCase: string;
    assert: ExerciseAssert;
    actual: unknown;
    expectPass: boolean;
    expectRejected?: boolean;
  }[] = [
    // equals
    { assertType: "equals", edgeCase: "NaN", assert: { type: "equals", value: NaN }, actual: NaN, expectPass: true },
    {
      assertType: "equals",
      edgeCase: "-0 vs +0",
      assert: { type: "equals", value: 0 },
      actual: -0,
      expectPass: false,
    },
    {
      assertType: "equals",
      edgeCase: "-0 vs -0",
      assert: { type: "equals", value: -0 },
      actual: -0,
      expectPass: true,
    },
    {
      assertType: "equals",
      edgeCase: "循環参照は拒否",
      assert: { type: "equals", value: 1 },
      actual: (() => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return o;
      })(),
      expectPass: false,
      expectRejected: true,
    },
    {
      assertType: "equals",
      edgeCase: "深いネスト",
      assert: { type: "equals", value: buildDeepArray(1000, 1) },
      actual: buildDeepArray(1000, 1),
      expectPass: true,
    },
    // deepEquals
    {
      assertType: "deepEquals",
      edgeCase: "NaN(ネスト内)",
      assert: { type: "deepEquals", value: { a: [1, NaN] } },
      actual: { a: [1, NaN] },
      expectPass: true,
    },
    {
      assertType: "deepEquals",
      edgeCase: "-0 vs +0(ネスト内)",
      assert: { type: "deepEquals", value: { a: [0] } },
      actual: { a: [-0] },
      expectPass: false,
    },
    {
      assertType: "deepEquals",
      edgeCase: "循環参照は拒否",
      assert: { type: "deepEquals", value: (() => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return o;
      })() },
      actual: { self: null },
      expectPass: false,
      expectRejected: true,
    },
    {
      assertType: "deepEquals",
      edgeCase: "深いネスト(不一致)",
      assert: { type: "deepEquals", value: buildDeepObject(500, 1) },
      actual: buildDeepObject(500, 2),
      expectPass: false,
    },
    // oneOf
    {
      assertType: "oneOf",
      edgeCase: "NaN",
      assert: { type: "oneOf", value: [1, NaN, 3] },
      actual: NaN,
      expectPass: true,
    },
    {
      assertType: "oneOf",
      edgeCase: "-0",
      assert: { type: "oneOf", value: [1, 0, 3] },
      actual: -0,
      expectPass: false,
    },
    {
      assertType: "oneOf",
      edgeCase: "循環参照は拒否",
      assert: { type: "oneOf", value: [1, 2] },
      actual: (() => {
        const arr: unknown[] = [];
        arr.push(arr);
        return arr;
      })(),
      expectPass: false,
      expectRejected: true,
    },
    {
      assertType: "oneOf",
      edgeCase: "深いネスト",
      assert: { type: "oneOf", value: [buildDeepArray(800, "x"), "other"] },
      actual: buildDeepArray(800, "x"),
      expectPass: true,
    },
    // matches
    {
      assertType: "matches",
      edgeCase: "NaNを文字列化",
      assert: { type: "matches", value: "^NaN$" },
      actual: NaN,
      expectPass: true,
    },
    {
      assertType: "matches",
      edgeCase: "-0を文字列化",
      assert: { type: "matches", value: "^0$" },
      actual: -0,
      expectPass: true,
    },
    {
      assertType: "matches",
      edgeCase: "循環参照は拒否",
      assert: { type: "matches", value: "." },
      actual: (() => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return o;
      })(),
      expectPass: false,
      expectRejected: true,
    },
    {
      assertType: "matches",
      edgeCase: "深いネストを文字列化して照合",
      assert: { type: "matches", value: "^hello$" },
      actual: "hello",
      expectPass: true,
    },
  ];

  it.each(cases.map((c) => [`${c.assertType}: ${c.edgeCase}`, c] as const))(
    "%s",
    (_label, c) => {
      const outcome = evaluateAssert(c.assert, c.actual);
      expect(outcome.pass).toBe(c.expectPass);
      if (c.expectRejected) {
        expect(outcome.error).toBeTruthy();
      }
    },
  );
});

describe("hasCircularReference", () => {
  it("returns false for acyclic values, including shared (DAG) references", () => {
    const shared = { v: 1 };
    expect(hasCircularReference({ a: shared, b: shared })).toBe(false);
    expect(hasCircularReference([1, 2, { a: [3, 4] }])).toBe(false);
    expect(hasCircularReference(buildDeepObject(2000, "leaf"))).toBe(false);
  });

  it("detects direct and indirect cycles", () => {
    const direct: Record<string, unknown> = {};
    direct.self = direct;
    expect(hasCircularReference(direct)).toBe(true);

    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a.b = b;
    expect(hasCircularReference(a)).toBe(true);
  });
});

describe("structuralEquals", () => {
  it("throws CircularReferenceError instead of overflowing the stack", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => structuralEquals(cyclic, cyclic)).toThrow(CircularReferenceError);
  });

  it("handles deep nesting without throwing (iterative, not recursion-depth-bound)", () => {
    expect(structuralEquals(buildDeepArray(50_000, "x"), buildDeepArray(50_000, "x"))).toBe(true);
  });
});

describe("diffValues", () => {
  it("reports per-key differences for objects", () => {
    const diff = diffValues({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(diff).toContain("b");
    expect(diff).toContain("2");
    expect(diff).toContain("3");
  });

  it("reports index differences for arrays", () => {
    const diff = diffValues([1, 2, 3], [1, 9, 3]);
    expect(diff).toContain("[1]");
  });

  it("falls back to a flat expected/actual message for primitives", () => {
    expect(diffValues(1, 2)).toBe("value: expected 1, actual 2");
  });

  it("caps recursion depth for very deeply nested mismatches, falling back to a flat json dump", () => {
    const depth = MAX_DIFF_DEPTH * 2;
    const diff = diffValues(buildDeepObject(depth, "a"), buildDeepObject(depth, "b"));

    // If the depth cap were removed, the path-based diff would walk all `depth`
    // levels (one ".next" per level); with the cap it must stop at MAX_DIFF_DEPTH
    // and fall back to a flat expected/actual json dump for the remaining subtree.
    const pathSegments = (diff.match(/\.next/g) ?? []).length;
    expect(pathSegments).toBeLessThanOrEqual(MAX_DIFF_DEPTH);
    expect(diff).toContain("expected");
    expect(diff).toContain("actual");
  });
});

describe("parseCheckExpression", () => {
  it("parses the design-doc example (moveRatioNear(1/4, 0.15))", () => {
    expect(parseCheckExpression("moveRatioNear(1/4, 0.15)")).toEqual({
      name: "moveRatioNear",
      args: [0.25, 0.15],
    });
  });

  it("supports parentheses, unary minus, and multiple operators", () => {
    expect(parseCheckExpression("f(-1 + 2 * (3 - 1))")).toEqual({ name: "f", args: [3] });
  });

  it("supports string/boolean/null literal arguments", () => {
    expect(parseCheckExpression('g("hi", true, false, null)')).toEqual({
      name: "g",
      args: ["hi", true, false, null],
    });
  });

  it("supports zero-argument calls", () => {
    expect(parseCheckExpression("noop()")).toEqual({ name: "noop", args: [] });
  });

  it.each([["missing paren", "f(1"], ["trailing garbage", "f(1))"], ["not a call", "1 + 2"]])(
    "throws CheckExpressionError on invalid syntax: %s",
    (_label, input) => {
      expect(() => parseCheckExpression(input)).toThrow(CheckExpressionError);
    },
  );
});

describe("evaluateProperty", () => {
  it("invokes the registered helper with parsed args and the resolveFn context", () => {
    const helpers: PropertyHelperRegistry = {
      moveRatioNear: (ctx, target, tolerance) => {
        expect(typeof ctx.resolveFn).toBe("function");
        return Math.abs((target as number) - 0.25) <= (tolerance as number);
      },
    };
    const outcome = evaluateProperty("moveRatioNear(0.24, 0.05)", helpers, {
      resolveFn: () => undefined,
    });
    expect(outcome.pass).toBe(true);
  });

  it("returns pass:false with a message when the helper reports failure", () => {
    const helpers: PropertyHelperRegistry = {
      alwaysFails: () => ({ pass: false, message: "did not converge" }),
    };
    const outcome = evaluateProperty("alwaysFails()", helpers, { resolveFn: () => undefined });
    expect(outcome.pass).toBe(false);
    expect(outcome.diff).toBe("did not converge");
  });

  it("fails gracefully (not a crash) when the helper is unregistered", () => {
    const outcome = evaluateProperty("unknownHelper(1)", {}, { resolveFn: () => undefined });
    expect(outcome.pass).toBe(false);
    expect(outcome.error).toContain("unknownHelper");
  });
});

describe("gradeTestCase / gradeExercise", () => {
  function deps(overrides: Partial<GraderDeps> = {}): GraderDeps {
    return { resolveFn: (name) => (name === "double" ? (n: number) => n * 2 : undefined), ...overrides };
  }

  it("grades an assert-based test case by calling the resolved function", () => {
    const tc: ExerciseTestCase = {
      id: "t1",
      call: { fn: "double", args: [3] },
      assert: { type: "equals", value: 6 },
    };
    expect(gradeTestCase(tc, deps())).toMatchObject({ id: "t1", pass: true, actual: "6" });
  });

  it("fails with an error (not a throw) when the export is missing", () => {
    const tc: ExerciseTestCase = {
      id: "t1",
      call: { fn: "missing", args: [] },
      assert: { type: "equals", value: 1 },
    };
    const result = gradeTestCase(tc, deps());
    expect(result.pass).toBe(false);
    expect(result.error).toContain("missing");
  });

  it("fails with an error (not a throw) when the user function throws", () => {
    const tc: ExerciseTestCase = {
      id: "t1",
      call: { fn: "double", args: [] },
      assert: { type: "equals", value: 1 },
    };
    const throwing = deps({
      resolveFn: () => () => {
        throw new Error("boom");
      },
    });
    const result = gradeTestCase(tc, throwing);
    expect(result.pass).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("grades a property test case via the registered helper", () => {
    const tc: ExerciseTestCase = {
      id: "t2",
      name: { ja: "", en: "" },
      kind: "property",
      check: "alwaysTrue()",
    };
    const result = gradeTestCase(tc, deps({ propertyHelpers: { alwaysTrue: () => true } }));
    expect(result.pass).toBe(true);
  });

  it("computes partial score = round(passed/total*100) and result=pass only when all pass", () => {
    const testCases: ExerciseTestCase[] = [
      { id: "t1", call: { fn: "double", args: [1] }, assert: { type: "equals", value: 2 } },
      { id: "t2", call: { fn: "double", args: [2] }, assert: { type: "equals", value: 999 } },
      { id: "t3", call: { fn: "double", args: [3] }, assert: { type: "equals", value: 6 } },
    ];
    const summary = gradeExercise(testCases, deps());
    expect(summary.score).toBe(67); // round(2/3*100) = 66.67 -> 67
    expect(summary.result).toBe("fail");
    expect(summary.perTest).toHaveLength(3);
  });

  it("reports result=pass with score=100 when every test passes", () => {
    const testCases: ExerciseTestCase[] = [
      { id: "t1", call: { fn: "double", args: [1] }, assert: { type: "equals", value: 2 } },
      { id: "t2", call: { fn: "double", args: [2] }, assert: { type: "equals", value: 4 } },
    ];
    const summary = gradeExercise(testCases, deps());
    expect(summary).toMatchObject({ result: "pass", score: 100 });
  });
});

describe("estimateComplexity", () => {
  it("labels roughly-constant-time growth as O(1)", () => {
    expect(estimateComplexity({ n: 100, durationMs: 10 }, { n: 1000, durationMs: 10.5 }).label).toBe(
      "O(1)",
    );
  });

  it("labels roughly-linear growth as O(n)", () => {
    expect(estimateComplexity({ n: 100, durationMs: 10 }, { n: 1000, durationMs: 100 }).label).toBe(
      "O(n)",
    );
  });

  it("labels roughly-quadratic growth as O(n^2)", () => {
    expect(estimateComplexity({ n: 100, durationMs: 1 }, { n: 1000, durationMs: 100 }).label).toBe(
      "O(n^2)",
    );
  });

  it("always includes the reference-only warning and never affects pass/fail", () => {
    const estimate = estimateComplexity({ n: 10, durationMs: 1 }, { n: 20, durationMs: 2 });
    expect(estimate.warning).toContain("合否判定には使用されません");
  });
});
