import { describe, expect, it } from "vitest";
import { ScenarioDefinitionSchema, ScenarioOutcomeSchema } from "@/lib/scenario/schema";

/**
 * 03文書T-302受入基準「シナリオYAMLスキーマ+分岐評価の単体テスト」のうち
 * スキーマ側。content/scenario-capstone.yamlの実データ検証はtests/unit/scenario/
 * content.test.tsで別途行う。
 */
const VALID_SCENARIO = {
  slug: "demo",
  title: { ja: "タイトル", en: "Title" },
  brief: { ja: "概要", en: "Brief" },
  decisions: [
    {
      id: "replication",
      prompt: { ja: "P", en: "P" },
      options: [
        { id: "single-leader", label: { ja: "L", en: "L" }, description: { ja: "D", en: "D" } },
        { id: "leaderless", label: { ja: "L2", en: "L2" }, description: { ja: "D2", en: "D2" } },
      ],
    },
  ],
  outcomes: [
    {
      id: "o1",
      match: { replication: "leaderless" },
      verdict: "optimal",
      score: 90,
      feedback: { ja: "F", en: "F" },
      consequences: [],
    },
  ],
  defaultOutcome: {
    id: "default",
    verdict: "acceptable",
    score: 50,
    feedback: { ja: "F", en: "F" },
    consequences: [],
  },
};

describe("ScenarioDefinitionSchema", () => {
  it("parses a well-formed scenario definition", () => {
    const result = ScenarioDefinitionSchema.safeParse(VALID_SCENARIO);
    expect(result.success).toBe(true);
  });

  it("rejects a decision with an unknown id (only replication/partitioning/consistency allowed)", () => {
    const invalid = {
      ...VALID_SCENARIO,
      decisions: [{ ...VALID_SCENARIO.decisions[0], id: "sharding" }],
    };
    const result = ScenarioDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a decision with fewer than 2 options", () => {
    const invalid = {
      ...VALID_SCENARIO,
      decisions: [{ ...VALID_SCENARIO.decisions[0], options: [VALID_SCENARIO.decisions[0].options[0]] }],
    };
    const result = ScenarioDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a scenario with no outcomes", () => {
    const invalid = { ...VALID_SCENARIO, outcomes: [] };
    const result = ScenarioDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts a defaultOutcome without a match field (ScenarioDefaultOutcomeSchema omits it)", () => {
    const result = ScenarioDefinitionSchema.safeParse(VALID_SCENARIO);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultOutcome).not.toHaveProperty("match");
    }
  });

  it("rejects a defaultOutcome missing a required field (verdict)", () => {
    const invalid = {
      ...VALID_SCENARIO,
      defaultOutcome: { id: "default", score: 50, feedback: { ja: "F", en: "F" } },
    };
    const result = ScenarioDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ScenarioOutcomeSchema", () => {
  it("rejects an outcome whose match specifies no axis at all", () => {
    const result = ScenarioOutcomeSchema.safeParse({
      id: "o-empty",
      match: {},
      verdict: "optimal",
      score: 90,
      feedback: { ja: "F", en: "F" },
      consequences: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an outcome whose match specifies a single axis", () => {
    const result = ScenarioOutcomeSchema.safeParse({
      id: "o-partial",
      match: { partitioning: "none" },
      verdict: "broken",
      score: 5,
      feedback: { ja: "F", en: "F" },
      consequences: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score outside the 0-100 range", () => {
    const result = ScenarioOutcomeSchema.safeParse({
      id: "o-bad-score",
      match: { partitioning: "none" },
      verdict: "broken",
      score: 150,
      feedback: { ja: "F", en: "F" },
      consequences: [],
    });
    expect(result.success).toBe(false);
  });
});
