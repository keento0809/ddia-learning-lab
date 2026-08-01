import { isLessonFullyVisibleUnauthenticated, type AccessTier } from "./contracts/access";
import type { Locale } from "./contracts/common";
import { getModuleDetail } from "./moduleDetail";

/**
 * T-604(ADR-009 §3.1・§5層1・§6)。quiz.yaml/演習YAMLはレッスンと異なり
 * Preview階層(冒頭のみ)を持たない(§3.1表: 「Gated: 上記以外の全レッスン本文、
 * 全クイズ、全演習、可視化」)。モジュール1(Free Tier)は全クイズ・演習が
 * 未認証で全文取得・実行可、それ以外は全モジュールがGated。
 *
 * `lib/contracts/access.ts`(T-602, CLAUDE.md規則2によりlib/contracts/配下の
 * 型・スキーマは変更禁止)は変更せず、同ファイルの`AccessTier`型と
 * `isLessonFullyVisibleUnauthenticated`(tier==="public"||"freeTier"の汎用判定、
 * レッスン専用ロジックではない)をそのまま再利用する薄いモジュール単位版として
 * 本ファイルを追加した(`lib/lessonAccess.ts`と同じ「page.tsxへ委譲する」層構造)。
 */
const FREE_TIER_MODULE_ORDER = 1;

export function getModuleAccessTier(moduleOrder: number): AccessTier {
  return moduleOrder === FREE_TIER_MODULE_ORDER ? "freeTier" : "gated";
}

/** slugからモジュールのアクセス階層を解決する。モジュールが存在しない場合はundefined */
export function resolveModuleAccessTier(locale: Locale, moduleSlug: string): AccessTier | undefined {
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) return undefined;
  return getModuleAccessTier(detail.meta.order);
}

export const isModuleFullyVisibleUnauthenticated = isLessonFullyVisibleUnauthenticated;
