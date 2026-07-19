import type { Quiz, QuizQuestion } from "./schema";

/**
 * 採点ロジック(T-106受入基準「採点ロジックの単体テスト(全問正解/部分点/0点)」)。
 * DOM/APIに依存しない純関数として切り出し、Vitestから直接検証できるようにする。
 */

/** 1問について、選択済みoptionId集合が正解集合と完全一致するかを判定する(部分一致は不正解) */
export function isQuestionCorrect(question: QuizQuestion, selectedOptionIds: readonly string[]): boolean {
  const correct = new Set(question.correctOptionIds);
  const selected = new Set(selectedOptionIds);
  if (correct.size !== selected.size) return false;
  for (const id of correct) {
    if (!selected.has(id)) return false;
  }
  return true;
}

export interface QuizQuestionResult {
  questionId: string;
  correct: boolean;
}

export interface QuizScoreResult {
  /** 0-100の整数。lib/contracts/api.ts の ProgressRecordSchema.score と同じ値域 */
  score: number;
  correctCount: number;
  totalCount: number;
  results: QuizQuestionResult[];
}

/** answersは questionId -> 選択済みoptionId配列。未回答の設問は空配列扱い(不正解) */
export function scoreQuiz(
  quiz: Quiz,
  answers: Readonly<Record<string, readonly string[]>>,
): QuizScoreResult {
  const totalCount = quiz.questions.length;
  if (totalCount === 0) {
    return { score: 0, correctCount: 0, totalCount: 0, results: [] };
  }

  const results = quiz.questions.map((question) => ({
    questionId: question.id,
    correct: isQuestionCorrect(question, answers[question.id] ?? []),
  }));
  const correctCount = results.filter((result) => result.correct).length;
  const score = Math.round((correctCount / totalCount) * 100);

  return { score, correctCount, totalCount, results };
}
