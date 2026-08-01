import { z } from "zod";

/**
 * ADR-009(docs/design/10_ADR-009_アクセス制御設計.md)§3.1 のアクセス階層。
 * T-602: lib/contracts/にアクセス階層の型定義を置く(タスク分割書 §7 T-602)。
 *
 * - public: ランディング/カリキュラム一覧/モジュール詳細/用語集/検索/認証画面。
 *   本モジュールでは判定対象にしない(常にpublicな静的ルートのため)。
 * - freeTier: モジュール1(信頼性・スケーラビリティ・保守性)の全レッスン・
 *   クイズ・演習。未認証でも全文取得・実行可。
 * - preview: モジュール2〜12の各モジュール第1レッスンの冒頭のみ(見出し2つ分
 *   または約30%)。未認証は冒頭のみ、認証済みは全文。
 * - gated: 上記以外の全レッスン本文・全クイズ・全演習・可視化。未認証には
 *   本文を一切返さない。
 * - authRequired: ダッシュボード/設定/ノート/修了証。既存実装済み(§3.1)。
 */
export const AccessTierSchema = z.enum(["public", "freeTier", "preview", "gated", "authRequired"]);
export type AccessTier = z.infer<typeof AccessTierSchema>;

/** ADR-009 §3.1: モジュール1(order===1)がFree Tier境界 */
const FREE_TIER_MODULE_ORDER = 1;
/** ADR-009 §3.1: 各モジュールの第1レッスン(order===1)のみPreview対象 */
const PREVIEW_LESSON_ORDER = 1;

export interface LessonAccessTierInput {
  /** モジュールslug(例: "02-data-models")。判定はmoduleOrderで行うため識別・トレース用途 */
  moduleSlug: string;
  /** module.yamlのorder(1始まり)。moduleOrder===1ならFree Tier */
  moduleOrder: number;
  /** レッスンslug(例: "01-relational-vs-document")。判定はlessonOrderで行うため識別・トレース用途 */
  lessonSlug: string;
  /** レッスンfrontmatterのorder(1始まり)。モジュール内で1ならPreview候補 */
  lessonOrder: number;
}

/**
 * レッスン単位のアクセス階層判定(純粋関数、単体テスト: tests/unit/contracts/access.test.ts)。
 * ADR-009 §3.1: モジュール1は全レッスンfreeTier。それ以外のモジュールは第1レッスンのみ
 * preview、残りは全てgated。
 */
export function getLessonAccessTier(input: LessonAccessTierInput): AccessTier {
  if (input.moduleOrder === FREE_TIER_MODULE_ORDER) return "freeTier";
  return input.lessonOrder === PREVIEW_LESSON_ORDER ? "preview" : "gated";
}

/** 未認証でもレッスン本文の全文が表示されるべきか(ADR-009 §5 層1) */
export function isLessonFullyVisibleUnauthenticated(tier: AccessTier): boolean {
  return tier === "public" || tier === "freeTier";
}

/** 未認証では冒頭プレビューのみ表示されるべきか(ADR-009 §3.2) */
export function isLessonPreviewOnlyUnauthenticated(tier: AccessTier): boolean {
  return tier === "preview";
}
