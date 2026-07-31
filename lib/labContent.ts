import type { Locale } from "./contracts/common";
import type { ExerciseDefinition } from "./contracts/exercise";
import exerciseJa from "./generated/exercise.ja.json";
import exerciseEn from "./generated/exercise.en.json";

/**
 * S-06 演習ページ(T-108r, 02§4.2)向けの演習YAMLデータ取得。
 * `lib/quiz.ts`と同じ理由(node:fs依存の`lib/content.ts`をServer Componentから
 * 直接importできない、docs/skeleton-notes.md)で、`scripts/generate-curriculum.ts`
 * のビルド時生成物を通常のESM importとして取り込む。キーは演習YAMLの`slug`
 * フィールドそのもの(content/{locale}配下で一意)。
 */

const GENERATED_EXERCISE: Record<Locale, Record<string, ExerciseDefinition>> = {
  ja: exerciseJa as Record<string, ExerciseDefinition>,
  en: exerciseEn as Record<string, ExerciseDefinition>,
};

/** 演習YAMLの`slug`に一致する演習が存在しない場合はundefined(呼び出し側でnotFound()) */
export function getExercise(locale: Locale, exerciseSlug: string): ExerciseDefinition | undefined {
  return GENERATED_EXERCISE[locale][exerciseSlug];
}
