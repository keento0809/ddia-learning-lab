import type {
  ScenarioDecisionId,
  ScenarioDefinition,
  ScenarioOutcome,
  ScenarioSelection,
} from "@/lib/scenario/schema";

/**
 * キャップストーン分岐シナリオの評価エンジン(T-302)。
 * 参照設計: docs/design/01_基本設計書.md §3(モジュール12)、03_実装タスク分割書.md T-302
 * 「シナリオYAMLスキーマ+分岐評価の単体テスト」。
 *
 * DOM/fs非依存の純関数のみで構成する(components/viz/*のSimEngineと同じ方針:
 * ロジックはUIから独立してテスト可能にする)。
 */

/** まだ選択されていない設計判断のid一覧(定義順) */
export function listUnansweredDecisions(
  definition: ScenarioDefinition,
  selection: ScenarioSelection,
): ScenarioDecisionId[] {
  return definition.decisions
    .map((decision) => decision.id)
    .filter((id) => selection[id] === undefined);
}

/** 全ての設計判断に回答済みか */
export function isScenarioComplete(
  definition: ScenarioDefinition,
  selection: ScenarioSelection,
): boolean {
  return listUnansweredDecisions(definition, selection).length === 0;
}

export class InvalidScenarioSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScenarioSelectionError";
  }
}

/**
 * 選択内容がシナリオ定義上妥当か(未知の軸/選択肢idを含んでいないか)を検証する。
 * UIは定義済みの選択肢しか提示しないため通常は発生しないが、API的な誤用や
 * シナリオ定義の改訂ミスを早期に検出するための防御的チェック。
 */
export function assertValidSelection(
  definition: ScenarioDefinition,
  selection: ScenarioSelection,
): void {
  for (const [decisionId, optionId] of Object.entries(selection)) {
    if (optionId === undefined) continue;
    const decision = definition.decisions.find((d) => d.id === decisionId);
    if (!decision) {
      throw new InvalidScenarioSelectionError(
        `シナリオに存在しない設計判断です: ${decisionId}`,
      );
    }
    if (!decision.options.some((option) => option.id === optionId)) {
      throw new InvalidScenarioSelectionError(
        `${decisionId}に存在しない選択肢です: ${optionId}`,
      );
    }
  }
}

/** outcomeのmatch条件が選択内容と一致するか(指定した軸のみを見る部分一致) */
function matchesOutcome(outcome: ScenarioOutcome, selection: ScenarioSelection): boolean {
  return Object.entries(outcome.match).every(
    ([decisionId, optionId]) =>
      optionId === undefined || selection[decisionId as ScenarioDecisionId] === optionId,
  );
}

/**
 * 全設計判断の選択に基づき分岐結果を評価する。`outcomes`は定義順に評価し、
 * 最初にマッチしたルールを採用する(優先度は配列順、より具体的な条件を
 * 先頭に置く運用は呼び出し側=シナリオ定義の責務)。マッチするルールが
 * なければ`defaultOutcome`を返す。
 *
 * 未回答の軸がある場合はInvalidScenarioSelectionErrorを投げる
 * (呼び出し側はisScenarioCompleteで事前に確認すること)。
 */
export function evaluateScenario(
  definition: ScenarioDefinition,
  selection: ScenarioSelection,
): ScenarioOutcome {
  if (!isScenarioComplete(definition, selection)) {
    throw new InvalidScenarioSelectionError(
      `未回答の設計判断があります: ${listUnansweredDecisions(definition, selection).join(", ")}`,
    );
  }
  assertValidSelection(definition, selection);

  const matched = definition.outcomes.find((outcome) => matchesOutcome(outcome, selection));
  if (matched) return matched;

  return { ...definition.defaultOutcome, match: {} };
}
