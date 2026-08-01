import { isLessonFullyVisibleUnauthenticated, type AccessTier } from "./contracts/access";

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
 *
 * 失敗→恒久対策: 当初`resolveModuleAccessTier(locale, moduleSlug)`(slugから
 * `lib/moduleDetail.ts`経由でtierを解決するラッパー)も用意していたが、
 * どの呼び出し元(quiz/labページ)も既に`getModuleDetail`呼び出し済みで
 * `detail.meta.order`を持っているため未使用のまま放置されていた。
 * `lib/moduleDetail.ts`は`./generated/module-detail.*.json`をトップレベルで
 * importするため、本ファイル経由でそれをimportすると
 * `lib/search/buildDocuments.ts`→`scripts/generate-curriculum.ts`という
 * 生成スクリプト自身の実行経路で「生成前のJSONを生成スクリプトが要求する」
 * 循環依存になり、クリーンチェックアウト(CI)で
 * `Cannot find module './generated/module-detail.ja.json'`により
 * `npm run typecheck`/`lint`が失敗した(ローカルでは`lib/generated/`に
 * 既存ファイルが残っていたため再現しなかった)。未使用関数の削除で
 * `lib/moduleDetail.ts`への依存自体を断ち、根治した。
 */
const FREE_TIER_MODULE_ORDER = 1;

export function getModuleAccessTier(moduleOrder: number): AccessTier {
  return moduleOrder === FREE_TIER_MODULE_ORDER ? "freeTier" : "gated";
}

export const isModuleFullyVisibleUnauthenticated = isLessonFullyVisibleUnauthenticated;
