import type { ModuleMeta } from "./contracts/module";
import type { Locale } from "./contracts/common";
import moduleDetailJa from "./generated/module-detail.ja.json";
import moduleDetailEn from "./generated/module-detail.en.json";

/**
 * S-03 モジュール詳細(T-102)向けのモジュール構成ロジック。
 * 参照設計: docs/design/01_基本設計書.md 画面一覧(S-03「レッスン/クイズ/演習の
 * 目次と進捗」)、03_実装タスク分割書.md T-102。
 *
 * `lib/curriculum.ts`(T-101)と同じ理由(docs/skeleton-notes.md、
 * STATUS.md 2026-07-18決定事項ログ)で、node:fs依存の`lib/content.ts`を
 * Server Componentから直接importせず、ビルド時生成済みJSON
 * (`scripts/generate-curriculum.ts`の生成物)を通常のESM importとして取り込む。
 */

export interface ModuleDetailLesson {
  /** レッスンMDXのファイル名(拡張子除く)。`/learn/{module}/{id}` のURLセグメント */
  id: string;
  title: string;
  order: number;
  minutes: number;
}

export interface ModuleDetailExercise {
  /** 演習YAMLのslug。`/learn/{module}/lab/{slug}` のURLセグメント */
  slug: string;
}

export interface ModuleDetailSummary {
  meta: ModuleMeta;
  lessons: ModuleDetailLesson[];
  hasQuiz: boolean;
  exercises: ModuleDetailExercise[];
}

const GENERATED_MODULE_DETAIL: Record<Locale, ModuleDetailSummary[]> = {
  ja: moduleDetailJa as ModuleDetailSummary[],
  en: moduleDetailEn as ModuleDetailSummary[],
};

/** slugに一致するモジュール詳細を返す。存在しない場合はundefined(呼び出し側でnotFound()) */
export function getModuleDetail(locale: Locale, moduleSlug: string): ModuleDetailSummary | undefined {
  return GENERATED_MODULE_DETAIL[locale].find((mod) => mod.meta.slug === moduleSlug);
}

export type ModuleTocItem =
  | { kind: "lesson"; id: string; title: string; minutes: number }
  | { kind: "quiz" }
  | { kind: "exercise"; slug: string; index: number };

/**
 * S-03「レッスン/クイズ/演習の目次」。01基本設計書の画面遷移(S03→S04/S05/S06)
 * に合わせ、レッスン(order昇順)→クイズ→演習の順で並べる。
 */
export function buildModuleToc(detail: ModuleDetailSummary): ModuleTocItem[] {
  const lessons: ModuleTocItem[] = [...detail.lessons]
    .sort((a, b) => a.order - b.order)
    .map((lesson) => ({ kind: "lesson", id: lesson.id, title: lesson.title, minutes: lesson.minutes }));
  const quiz: ModuleTocItem[] = detail.hasQuiz ? [{ kind: "quiz" }] : [];
  const exercises: ModuleTocItem[] = detail.exercises.map((exercise, index) => ({
    kind: "exercise",
    slug: exercise.slug,
    index: index + 1,
  }));
  return [...lessons, ...quiz, ...exercises];
}

/** TOC上のアイテムへのルート内相対パス(ロケールプレフィックスなし) */
export function tocItemHref(moduleSlug: string, item: ModuleTocItem): string {
  if (item.kind === "lesson") return `/learn/${moduleSlug}/${item.id}`;
  if (item.kind === "quiz") return `/learn/${moduleSlug}/quiz`;
  return `/learn/${moduleSlug}/lab/${item.slug}`;
}

/** React key等に使う、TOCアイテムを一意に識別する文字列 */
export function tocItemKey(item: ModuleTocItem): string {
  if (item.kind === "lesson") return `lesson-${item.id}`;
  if (item.kind === "quiz") return "quiz";
  return `exercise-${item.slug}`;
}

/**
 * 次アイテム導線(03文書T-102受入基準)。進捗に基づく「続きから」はT-105の
 * スコープ(S-02/S-03への進捗オーバーレイ)のため、T-102時点では目次の
 * 先頭アイテムに固定する。目次が空(コンテンツ未投入)の場合はnull。
 */
export function nextItemHref(moduleSlug: string, toc: readonly ModuleTocItem[]): string | null {
  const first = toc[0];
  return first ? tocItemHref(moduleSlug, first) : null;
}
