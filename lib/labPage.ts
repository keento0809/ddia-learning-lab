import { getExercise } from "./labContent";
import { exerciseRouteSegment, type ModuleDetailSummary } from "./moduleDetail";
import type { Locale } from "./contracts/common";
import type { ExerciseDefinition } from "./contracts/exercise";

export interface LabPageData {
  moduleTitle: string;
  /** 目次上の通し番号(1始まり)。messages.moduleDetail.exerciseItemLabelに渡す */
  index: number;
  exercise: ExerciseDefinition;
}

/**
 * S-06 演習ページ(T-108r)向けのページデータ組み立て。
 * ルートの`[exercise]`セグメント(モジュールprefixを含まない、T-108d参照)を
 * `detail.exercises`(T-102, moduleSlugプレフィックス込みの実slug一覧)と
 * `exerciseRouteSegment`(T-108d、`lib/moduleDetail.ts`のTOCリンク生成と同じ
 * ロジック)で突き合わせ、一致する演習の完全slugでExerciseDefinitionを取得する。
 * `lib/lessonPage.ts`(T-103)と同じ設計(detailは呼び出し側から渡させ、
 * フィクスチャに対する純粋関数テストを可能にする)。
 */
export function buildLabPageData(
  locale: Locale,
  moduleSlug: string,
  exerciseSegment: string,
  detail: ModuleDetailSummary,
): LabPageData | undefined {
  const index = detail.exercises.findIndex(
    (item) => exerciseRouteSegment(moduleSlug, item.slug) === exerciseSegment,
  );
  if (index === -1) return undefined;

  const exercise = getExercise(locale, detail.exercises[index].slug);
  if (!exercise) return undefined;

  return { moduleTitle: detail.meta.title, index: index + 1, exercise };
}
