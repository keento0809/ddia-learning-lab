import { buildModuleToc, tocItemHref, tocItemKey, type ModuleDetailSummary } from "./moduleDetail";

export interface LessonPageData {
  moduleSlug: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  minutes: number;
  toc: ReturnType<typeof buildModuleToc>;
  currentKey: string;
  prevHref: string | null;
  nextHref: string | null;
}

/**
 * S-04 レッスン画面(T-103)向けのページデータ組み立て。
 * T-102のlib/moduleDetail.ts(buildModuleToc等)を再利用し、対象レッスンの
 * 前後アイテム導線(前へ/次へ)を導出する。「完了して次へ」(進捗API接続)は
 * Out of Scope(T-105)のため、ここでは目次上の隣接アイテムへの単純な
 * ナビゲーションのみを提供する。
 *
 * detailはgetModuleDetail(locale, moduleSlug)呼び出し側(page.tsx)から渡させる
 * (T-102のModuleDetailコンポーネントと同じ設計)。これによりフィクスチャに対する
 * 純粋関数テストが可能になる。
 */
export function buildLessonPageData(
  moduleSlug: string,
  lessonId: string,
  detail: ModuleDetailSummary,
): LessonPageData | undefined {
  const lesson = detail.lessons.find((item) => item.id === lessonId);
  if (!lesson) return undefined;

  const toc = buildModuleToc(detail);
  const currentKey = `lesson-${lessonId}`;
  const currentIndex = toc.findIndex((item) => tocItemKey(item) === currentKey);
  const prevItem = currentIndex > 0 ? toc[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < toc.length - 1 ? toc[currentIndex + 1] : null;

  return {
    moduleSlug,
    moduleTitle: detail.meta.title,
    lessonId,
    lessonTitle: lesson.title,
    minutes: lesson.minutes,
    toc,
    currentKey,
    prevHref: prevItem ? tocItemHref(moduleSlug, prevItem) : null,
    nextHref: nextItem ? tocItemHref(moduleSlug, nextItem) : null,
  };
}
