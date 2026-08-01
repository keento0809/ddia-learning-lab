import { getLessonAccessTier, type AccessTier } from "./contracts/access";
import type { Locale } from "./contracts/common";
import { getModuleDetail } from "./moduleDetail";
import lessonPreviewJa from "./generated/lesson-preview.ja.json";
import lessonPreviewEn from "./generated/lesson-preview.en.json";

/**
 * T-602(ADR-009 §3.1・§5層1): moduleSlug/lessonIdからアクセス階層を解決する。
 * lib/contracts/access.tsの純粋関数(moduleOrder/lessonOrderベース)を、
 * 既存のビルド時生成データ(lib/moduleDetail.ts)経由でslugから解決するための
 * 薄いラッパー(lib/lessonPage.tsと同じ層構造)。
 *
 * 対象が存在しない(モジュール/レッスンslugが不正)場合はundefined
 * (呼び出し側はnotFound()、app/[locale]/learn/[module]/[lesson]/page.tsx参照)。
 */
export function resolveLessonAccessTier(
  locale: Locale,
  moduleSlug: string,
  lessonId: string,
): AccessTier | undefined {
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) return undefined;
  const lesson = detail.lessons.find((item) => item.id === lessonId);
  if (!lesson) return undefined;
  return getLessonAccessTier({
    moduleSlug,
    moduleOrder: detail.meta.order,
    lessonSlug: lessonId,
    lessonOrder: lesson.order,
  });
}

const GENERATED_LESSON_PREVIEW: Record<Locale, Record<string, string>> = {
  ja: lessonPreviewJa,
  en: lessonPreviewEn,
};

/**
 * Preview階層レッスンの冒頭HTML(scripts/generate-curriculum.ts生成、
 * lib/lessonPreview.tsの抽出ロジック)。Preview対象でない場合や生成物が
 * 見つからない場合はundefined。
 */
export function getLessonPreviewHtml(
  locale: Locale,
  moduleSlug: string,
  lessonId: string,
): string | undefined {
  return GENERATED_LESSON_PREVIEW[locale][`${moduleSlug}/${lessonId}`];
}
