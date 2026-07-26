import { describe, expect, it } from "vitest";
import type { ScenarioDefinition } from "@/lib/scenario/schema";
import {
  InvalidScenarioSelectionError,
  assertValidSelection,
  evaluateScenario,
  isScenarioComplete,
  listUnansweredDecisions,
} from "@/lib/scenario/engine";

/**
 * 03文書T-302受入基準「分岐評価の単体テスト」。DOM/fs非依存の純関数
 * (lib/scenario/engine.ts)を、レプリケーション方式/パーティション戦略/
 * 整合性モデルという設計判断の分岐込みで直接検証する。
 */
function decision(
  id: "replication" | "partitioning" | "consistency",
  optionIds: string[],
): ScenarioDefinition["decisions"][number] {
  return {
    id,
    prompt: { ja: id, en: id },
    options: optionIds.map((optionId) => ({
      id: optionId,
      label: { ja: optionId, en: optionId },
      description: { ja: optionId, en: optionId },
    })),
  };
}

const SCENARIO: ScenarioDefinition = {
  slug: "test-scenario",
  title: { ja: "テスト", en: "Test" },
  brief: { ja: "テスト用シナリオ", en: "Test scenario" },
  decisions: [
    decision("replication", ["single-leader", "multi-leader", "leaderless"]),
    decision("partitioning", ["key-range", "hash", "none"]),
    decision("consistency", ["strong", "causal", "eventual"]),
  ],
  outcomes: [
    {
      id: "broken-no-partitioning",
      match: { partitioning: "none" },
      verdict: "broken",
      score: 5,
      feedback: { ja: "破綻", en: "broken" },
      consequences: [],
    },
    {
      id: "optimal-leaderless-hash-eventual",
      match: { replication: "leaderless", partitioning: "hash", consistency: "eventual" },
      verdict: "optimal",
      score: 95,
      feedback: { ja: "最適", en: "optimal" },
      consequences: [],
    },
    {
      id: "risky-singleleader-strong",
      match: { replication: "single-leader", consistency: "strong" },
      verdict: "risky",
      score: 40,
      feedback: { ja: "リスク", en: "risky" },
      consequences: [],
    },
  ],
  defaultOutcome: {
    id: "default",
    verdict: "acceptable",
    score: 55,
    feedback: { ja: "既定", en: "default" },
    consequences: [],
  },
};

describe("listUnansweredDecisions / isScenarioComplete", () => {
  it("lists every decision id when nothing has been answered", () => {
    expect(listUnansweredDecisions(SCENARIO, {})).toEqual([
      "replication",
      "partitioning",
      "consistency",
    ]);
    expect(isScenarioComplete(SCENARIO, {})).toBe(false);
  });

  it("lists only the remaining decisions when some are answered", () => {
    expect(listUnansweredDecisions(SCENARIO, { replication: "leaderless" })).toEqual([
      "partitioning",
      "consistency",
    ]);
  });

  it("is complete once all three axes have a selection", () => {
    expect(
      isScenarioComplete(SCENARIO, {
        replication: "leaderless",
        partitioning: "hash",
        consistency: "eventual",
      }),
    ).toBe(true);
  });
});

describe("evaluateScenario branching", () => {
  it("selects the most specific (3-axis) outcome when it matches (optimal branch)", () => {
    const outcome = evaluateScenario(SCENARIO, {
      replication: "leaderless",
      partitioning: "hash",
      consistency: "eventual",
    });
    expect(outcome.id).toBe("optimal-leaderless-hash-eventual");
    expect(outcome.verdict).toBe("optimal");
  });

  it("prioritizes the partitioning=none blocker over a more favorable replication/consistency pair", () => {
    // レプリケーション/整合性は最適な組み合わせだが、パーティションなしは
    // それ単独で「broken」になる(定義順で先に評価されるため)。
    const outcome = evaluateScenario(SCENARIO, {
      replication: "leaderless",
      partitioning: "none",
      consistency: "eventual",
    });
    expect(outcome.id).toBe("broken-no-partitioning");
    expect(outcome.verdict).toBe("broken");
  });

  it("matches a 2-axis rule regardless of the third (unconstrained) axis", () => {
    const withKeyRange = evaluateScenario(SCENARIO, {
      replication: "single-leader",
      partitioning: "key-range",
      consistency: "strong",
    });
    const withHash = evaluateScenario(SCENARIO, {
      replication: "single-leader",
      partitioning: "hash",
      consistency: "strong",
    });
    expect(withKeyRange.id).toBe("risky-singleleader-strong");
    expect(withHash.id).toBe("risky-singleleader-strong");
  });

  it("falls back to defaultOutcome when no rule matches", () => {
    const outcome = evaluateScenario(SCENARIO, {
      replication: "multi-leader",
      partitioning: "key-range",
      consistency: "causal",
    });
    expect(outcome.id).toBe("default");
    expect(outcome.verdict).toBe("acceptable");
  });

  it("throws InvalidScenarioSelectionError when a decision is unanswered", () => {
    expect(() =>
      evaluateScenario(SCENARIO, { replication: "leaderless", partitioning: "hash" }),
    ).toThrow(InvalidScenarioSelectionError);
  });

  it("throws InvalidScenarioSelectionError when an option id is not valid for its axis", () => {
    expect(() =>
      evaluateScenario(SCENARIO, {
        replication: "leaderless",
        partitioning: "hash",
        consistency: "not-a-real-option",
      }),
    ).toThrow(InvalidScenarioSelectionError);
  });
});

describe("assertValidSelection", () => {
  it("does not throw for a partial, well-formed selection", () => {
    expect(() => assertValidSelection(SCENARIO, { replication: "leaderless" })).not.toThrow();
  });

  it("throws for an unknown decision axis", () => {
    expect(() =>
      assertValidSelection(SCENARIO, { sharding: "hash" } as never),
    ).toThrow(InvalidScenarioSelectionError);
  });
});
