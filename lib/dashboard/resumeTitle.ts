import type { Locale } from "@/lib/i18n/messages";
import type { ProgressItemType } from "@/lib/contracts";
import { getModuleDetail, tocItemHref, type ModuleDetailSummary } from "@/lib/moduleDetail";

export interface ResumeDisplay {
  moduleTitle: string;
  /** レッスンのみ解決可能(quiz/exerciseは表示名を持たないデータモデル、02§7.2/T-108決定事項ログ) */
  lessonTitle: string | null;
}

/** itemSlug(`{moduleSlug}/{rest}`)をモジュールslugと残り部分に分解する */
export function splitItemSlug(itemSlug: string): { moduleSlug: string; rest: string } {
  const separatorIndex = itemSlug.indexOf("/");
  return separatorIndex === -1
    ? { moduleSlug: itemSlug, rest: "" }
    : { moduleSlug: itemSlug.slice(0, separatorIndex), rest: itemSlug.slice(separatorIndex + 1) };
}

/**
 * resume.titleKey(=itemSlug)を画面表示用タイトルへ解決する純粋関数(T-112)。
 * 既にlookup済みのModuleDetailSummaryを受け取ることで、lib/moduleDetail.tsの
 * ビルド時生成JSON(静的import)への依存をテスト時に切り離せるようにする
 * (フィクスチャ由来のModuleDetailSummaryを直接渡してユニットテスト可能)。
 */
export function resolveResumeDisplayFromDetail(
  itemType: ProgressItemType,
  itemSlug: string,
  detail: ModuleDetailSummary | undefined,
): ResumeDisplay {
  const { moduleSlug, rest } = splitItemSlug(itemSlug);
  const moduleTitle = detail?.meta.title ?? moduleSlug;

  if (itemType !== "lesson") {
    return { moduleTitle, lessonTitle: null };
  }
  const lessonTitle = detail?.lessons.find((lesson) => lesson.id === rest)?.title ?? null;
  return { moduleTitle, lessonTitle };
}

/** lib/moduleDetail.ts(T-102のビルド時生成物、変更なし)から実データを引いて解決する(本番コード用) */
export function resolveResumeDisplay(
  locale: Locale,
  itemType: ProgressItemType,
  itemSlug: string,
): ResumeDisplay {
  const { moduleSlug } = splitItemSlug(itemSlug);
  return resolveResumeDisplayFromDetail(itemType, itemSlug, getModuleDetail(locale, moduleSlug));
}

/**
 * resume itemへの遷移先href(ロケールプレフィックスなし)。
 * lib/moduleDetail.tsのtocItemHref(S-03既存、変更なし)をそのまま再利用し、
 * URL組み立てロジックの重複・乖離を避ける。
 */
export function resolveResumeHref(itemType: ProgressItemType, itemSlug: string): string {
  const { moduleSlug, rest } = splitItemSlug(itemSlug);

  if (itemType === "lesson") {
    return tocItemHref(moduleSlug, { kind: "lesson", id: rest, title: "", minutes: 0 });
  }
  if (itemType === "quiz") {
    return tocItemHref(moduleSlug, { kind: "quiz" });
  }
  return tocItemHref(moduleSlug, { kind: "exercise", slug: itemSlug, index: 0 });
}
