import { describe, expect, it } from "vitest";
import { ExerciseDefinitionSchema } from "@/lib/contracts/exercise";

const validDefinition = {
  slug: "06-partitioning/consistent-hash",
  language: "js",
  entry: "assignKey",
  template:
    "// ノードのリストとキーを受け取り、担当ノードを返す\nexport function assignKey(nodes, key, vnodes = 100) {\n  // TODO\n}\n",
  tests: [
    {
      id: "t1",
      call: { fn: "assignKey", args: [["a", "b", "c"], "user-42"] },
      assert: { type: "oneOf", value: ["a", "b", "c"] },
    },
    {
      id: "t2",
      name: {
        ja: "ノード追加時の移動キーが約1/nである",
        en: "~1/n keys move when a node joins",
      },
      kind: "property",
      check: "moveRatioNear(1/4, 0.15)",
    },
  ],
  timeoutMs: 3000,
  hints: [
    {
      ja: "各ノードをvnodes個の仮想ノードとしてリング上に配置します",
      en: "Place each node as vnodes virtual points on the ring",
    },
  ],
};

describe("ExerciseDefinitionSchema", () => {
  it("parses the 02 §5.3 consistent-hash example (assert + property test cases)", () => {
    const result = ExerciseDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });

  it("defaults hints to an empty array when omitted", () => {
    const withoutHints: Record<string, unknown> = { ...validDefinition };
    delete withoutHints.hints;
    const result = ExerciseDefinitionSchema.parse(withoutHints);
    expect(result.hints).toEqual([]);
  });

  it("rejects an empty tests array", () => {
    const result = ExerciseDefinitionSchema.safeParse({
      ...validDefinition,
      tests: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a property test case missing the check field", () => {
    const result = ExerciseDefinitionSchema.safeParse({
      ...validDefinition,
      tests: [
        {
          id: "t2",
          name: { ja: "テスト", en: "test" },
          kind: "property",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown assert type", () => {
    const result = ExerciseDefinitionSchema.safeParse({
      ...validDefinition,
      tests: [
        {
          id: "t1",
          call: { fn: "assignKey", args: [] },
          assert: { type: "startsWith", value: "a" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
