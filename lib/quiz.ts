import type { Locale } from "./contracts/common";
import type { Quiz } from "./quiz/schema";
import quizJa from "./generated/quiz.ja.json";
import quizEn from "./generated/quiz.en.json";

/**
 * S-05 クイズ(T-106)向けのquiz.yamlデータ取得。
 * `lib/moduleDetail.ts`/`lib/curriculum.ts`と同じ理由(node:fs依存の
 * `lib/content.ts`をServer Componentから直接importできない、docs/skeleton-notes.md)
 * で、`scripts/generate-curriculum.ts`のビルド時生成物を通常のESM importとして
 * 取り込む。
 */

const GENERATED_QUIZ: Record<Locale, Record<string, Quiz>> = {
  ja: quizJa as Record<string, Quiz>,
  en: quizEn as Record<string, Quiz>,
};

/** モジュールにquiz.yamlが存在しない場合はundefined(呼び出し側でnotFound()) */
export function getQuiz(locale: Locale, moduleSlug: string): Quiz | undefined {
  return GENERATED_QUIZ[locale][moduleSlug];
}
