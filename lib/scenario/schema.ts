import { z } from "zod";
import { LocalizedTextSchema } from "@/lib/contracts/common";

/**
 * キャップストーン分岐シナリオYAML(content/scenario-capstone.yaml)のスキーマ。
 * 参照設計: docs/design/01_基本設計書.md §3(モジュール12
 * 「要件からレプリケーション方式・パーティション戦略・整合性モデルを選択する
 * 設計判断シミュレーション」)、03_実装タスク分割書.md T-302。
 *
 * lib/glossaryContent.ts(用語集)/lib/quiz/schema.ts(クイズ)と同じく、この
 * 単一YAMLコンテンツのスキーマはローカル定義とする。lib/contracts/index.ts
 * 「T-010完了以降、このディレクトリ配下の変更は専用タスクでのみ許可
 * (CLAUDE.md)」・CLAUDE.md規則2「lib/contracts/配下の型・スキーマは変更禁止」に
 * 対し、T-302の受入基準(2)は文言上lib/contracts/への配置を示唆するが、qa-evaluator
 * 指摘を受け既存の確立した運用(glossary/quiz)を優先してlib/contracts/には一切
 * 変更を加えず、ここへローカル定義する方針に修正した。lib/contracts/への昇格要否は
 * 未決のため、完了報告でこの判断自体を明示し人間の確認を仰ぐ。
 */

/** 設計判断の軸。01基本設計書のキャップストーン記述にある3軸に固定する */
export const ScenarioDecisionIdSchema = z.enum(["replication", "partitioning", "consistency"]);
export type ScenarioDecisionId = z.infer<typeof ScenarioDecisionIdSchema>;

/** 1つの設計判断における選択肢 */
export const ScenarioOptionSchema = z.object({
  id: z.string().min(1),
  label: LocalizedTextSchema,
  description: LocalizedTextSchema,
});
export type ScenarioOption = z.infer<typeof ScenarioOptionSchema>;

/** 1つの設計判断(軸)。選択肢は2つ以上必須 */
export const ScenarioDecisionSchema = z.object({
  id: ScenarioDecisionIdSchema,
  prompt: LocalizedTextSchema,
  options: z.array(ScenarioOptionSchema).min(2),
});
export type ScenarioDecision = z.infer<typeof ScenarioDecisionSchema>;

/** 分岐評価の結果ランク。scoreは参考表示、合否判定には使わない(演習のcomplexityと同じ扱い) */
export const ScenarioVerdictSchema = z.enum(["optimal", "acceptable", "risky", "broken"]);
export type ScenarioVerdict = z.infer<typeof ScenarioVerdictSchema>;

/**
 * 軸ごとの選択option id。3軸すべてを揃える必要はない(未回答の軸はキー自体を
 * 持たない)ため、zodのenumキー`record`(全キー必須)ではなく、全軸optionalの
 * 部分オブジェクトとして定義する。
 */
export const ScenarioSelectionSchema = z.object({
  replication: z.string().optional(),
  partitioning: z.string().optional(),
  consistency: z.string().optional(),
});
export type ScenarioSelection = z.infer<typeof ScenarioSelectionSchema>;

/**
 * 分岐結果ルール。`match`に指定した軸のみを条件とする部分一致
 * (未指定の軸はどの選択肢でもマッチする)。複数ルールが同時にマッチしうるため、
 * 定義順(配列の先頭)を優先度とし、より具体的な条件(指定軸数が多いルール)を
 * 先に置く運用とする(lib/scenario/engine.tsのevaluateScenarioが順に評価)。
 */
export const ScenarioOutcomeSchema = z.object({
  id: z.string().min(1),
  match: ScenarioSelectionSchema.refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    { message: "matchは最低1軸を指定してください" },
  ),
  verdict: ScenarioVerdictSchema,
  score: z.number().int().min(0).max(100),
  feedback: LocalizedTextSchema,
  consequences: z.array(LocalizedTextSchema).default([]),
});
export type ScenarioOutcome = z.infer<typeof ScenarioOutcomeSchema>;

/** どのoutcomeにもマッチしない場合に使うフォールバック(matchを持たない) */
export const ScenarioDefaultOutcomeSchema = ScenarioOutcomeSchema.omit({ match: true });
export type ScenarioDefaultOutcome = z.infer<typeof ScenarioDefaultOutcomeSchema>;

/** シナリオYAML全体(content/scenario-capstone.yaml) */
export const ScenarioDefinitionSchema = z.object({
  slug: z.string().min(1),
  title: LocalizedTextSchema,
  brief: LocalizedTextSchema,
  decisions: z.array(ScenarioDecisionSchema).min(1),
  outcomes: z.array(ScenarioOutcomeSchema).min(1),
  defaultOutcome: ScenarioDefaultOutcomeSchema,
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;
