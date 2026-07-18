import type { ModuleMeta } from "./contracts/module";
import type { Locale } from "./contracts/common";
import curriculumJa from "./generated/curriculum.ja.json";
import curriculumEn from "./generated/curriculum.en.json";

/**
 * S-02 カリキュラム一覧(T-101)向けのモジュール一覧ロジック。
 * 参照設計: docs/design/02_詳細設計書.md §4.3, 03_実装タスク分割書.md T-101。
 *
 * `lib/content.ts`(node:fs依存、ビルド時専用)を直接importしない。
 * `app/[locale]/learn/page.tsx` はServer Componentとしてバンドルされ、
 * OpenNextのCloudflareアダプタはキャッシュバックエンド(R2)未設定のため
 * プリレンダー済み出力を使えずリクエスト時にページ関数を再実行する
 * (docs/skeleton-notes.md、STATUS.md 2026-07-18決定事項ログで確認済みの制約)。
 * fs呼び出しを含む関数がバンドルに含まれると、Cloudflare Workersの
 * unenv fsシムには実ファイル読み込みが実装されていないため
 * `[unenv] fs.readFile is not implemented yet!` で必ず失敗する。
 * `scripts/generate-curriculum.ts` がビルド時(Node CLI)に`lib/content.ts`を
 * 呼び出して生成した静的JSONを、ここでは通常のESM importとして取り込む
 * (webpackが値をバンドルに埋め込むため、リクエスト時のfs呼び出しは発生しない)。
 */

export type CurriculumPart = "I" | "II" | "III";
export const CURRICULUM_PARTS: readonly CurriculumPart[] = ["I", "II", "III"];

/** 02文書はmodule.yamlにpartフィールドを持たせない設計のため、orderの範囲から導出する
 * (モジュール1-4=Part I, 5-9=Part II, 10-12=Part III。T-010決定事項ログの設計判断)。 */
export function partForOrder(order: number): CurriculumPart {
  if (order <= 4) return "I";
  if (order <= 9) return "II";
  return "III";
}

export interface CurriculumModuleSummary {
  meta: ModuleMeta;
  lessonCount: number;
}

export function groupModulesByPart(
  modules: readonly CurriculumModuleSummary[],
): Record<CurriculumPart, CurriculumModuleSummary[]> {
  const grouped: Record<CurriculumPart, CurriculumModuleSummary[]> = {
    I: [],
    II: [],
    III: [],
  };
  const sorted = [...modules].sort((a, b) => a.meta.order - b.meta.order);
  for (const mod of sorted) {
    grouped[partForOrder(mod.meta.order)].push(mod);
  }
  return grouped;
}

const GENERATED_CURRICULUM: Record<Locale, CurriculumModuleSummary[]> = {
  ja: curriculumJa as CurriculumModuleSummary[],
  en: curriculumEn as CurriculumModuleSummary[],
};

/** ビルド時生成済みの`lib/generated/curriculum.{locale}.json`から一覧を取得する */
export function getCurriculumModules(locale: Locale): CurriculumModuleSummary[] {
  return GENERATED_CURRICULUM[locale];
}
