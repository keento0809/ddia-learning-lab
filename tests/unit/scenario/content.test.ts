import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "@/lib/scenario/content";
import { assertValidSelection, evaluateScenario } from "@/lib/scenario/engine";

/**
 * content/scenario-capstone.yaml(T-302の実コンテンツ)が、スキーマ準拠かつ
 * 分岐評価エンジンから見て整合していることを検証する。
 */
const CONTENT_ROOT = path.join(process.cwd(), "content");

describe("content/scenario-capstone.yaml", () => {
  const scenario = loadScenario(CONTENT_ROOT);

  it("defines exactly the three design-decision axes required by 01基本設計書 §3", () => {
    expect(scenario.decisions.map((d) => d.id).sort()).toEqual([
      "consistency",
      "partitioning",
      "replication",
    ]);
  });

  it("every outcome.match option id is a real option of its axis", () => {
    for (const outcome of scenario.outcomes) {
      for (const [decisionId, optionId] of Object.entries(outcome.match)) {
        const decision = scenario.decisions.find((d) => d.id === decisionId);
        expect(decision, `outcome ${outcome.id} references unknown axis ${decisionId}`).toBeDefined();
        expect(
          decision!.options.some((o) => o.id === optionId),
          `outcome ${outcome.id} references unknown option ${decisionId}=${optionId}`,
        ).toBe(true);
      }
    }
  });

  it("evaluates every full combination of options without throwing", () => {
    const [replicationOptions, partitioningOptions, consistencyOptions] = scenario.decisions.map(
      (d) => d.options.map((o) => o.id),
    );
    for (const replication of replicationOptions!) {
      for (const partitioning of partitioningOptions!) {
        for (const consistency of consistencyOptions!) {
          const selection = { replication, partitioning, consistency };
          expect(() => assertValidSelection(scenario, selection)).not.toThrow();
          const outcome = evaluateScenario(scenario, selection);
          expect(outcome.verdict).toBeDefined();
        }
      }
    }
  });

  it("reaches the documented broken branch when partitioning is 'none'", () => {
    const outcome = evaluateScenario(scenario, {
      replication: "leaderless",
      partitioning: "none",
      consistency: "eventual",
    });
    expect(outcome.verdict).toBe("broken");
  });

  it("reaches the documented optimal branch for leaderless+hash+eventual", () => {
    const outcome = evaluateScenario(scenario, {
      replication: "leaderless",
      partitioning: "hash",
      consistency: "eventual",
    });
    expect(outcome.verdict).toBe("optimal");
  });

  // qa-evaluator指摘: single-leaderは整合性モデルに関わらずリーダーの
  // リージョンが分断されると他リージョンから書き込めなくなる(brief記載の
  // 要件(2)違反)ため、causal/eventualを選んでもdefaultOutcomeに埋もれず
  // "risky"として扱われるべきである。
  it("flags every single-leader combination as risky, never falling through to the generic default", () => {
    for (const partitioning of ["key-range", "hash"]) {
      for (const consistency of ["strong", "causal", "eventual"]) {
        const outcome = evaluateScenario(scenario, {
          replication: "single-leader",
          partitioning,
          consistency,
        });
        expect(outcome.verdict, `single-leader/${partitioning}/${consistency}`).toBe("risky");
      }
    }
  });

  it("falls through to defaultOutcome for only a minority of combinations (not most of them)", () => {
    const [replicationOptions, partitioningOptions, consistencyOptions] = scenario.decisions.map(
      (d) => d.options.map((o) => o.id),
    );
    let defaultCount = 0;
    let total = 0;
    for (const replication of replicationOptions!) {
      for (const partitioning of partitioningOptions!) {
        for (const consistency of consistencyOptions!) {
          total += 1;
          const outcome = evaluateScenario(scenario, { replication, partitioning, consistency });
          if (outcome.id === "default") defaultCount += 1;
        }
      }
    }
    expect(total).toBe(27);
    // content/scenario-capstone.yamlは固定コンテンツなので、この数は厳密に固定できる
    // (test-integrity-reviewer指摘: 片側不等号だと退行=defaultCount減少を検知できない)。
    expect(defaultCount).toBe(6);
  });
});
