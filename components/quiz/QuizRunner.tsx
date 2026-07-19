"use client";

import { useState } from "react";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { Quiz } from "@/lib/quiz/schema";
import { scoreQuiz } from "@/lib/quiz/scoring";
import { submitQuizProgress } from "@/lib/quiz/submitProgress";
import { QuizQuestionCard } from "./QuizQuestionCard";

type SubmissionStatus = "idle" | "submitting" | "submitted" | "error";

/**
 * S-05 クイズ(T-106)本体。`app/[locale]/learn/[module]/quiz/page.tsx`から
 * quiz.yamlデータ(ビルド時生成、lib/quiz.ts)を受け取り、単一/複数選択・
 * 即時フィードバック+解説・全問終了後のスコア計算→進捗API送信を行う。
 *
 * `isAuthenticated`はServer Component(page.tsx)側の`auth()`セッション確認結果を
 * propとして受け取る。未ログイン時は02§4.1「スクロール80%到達で自動的に
 * in_progress記録(ログイン時のみ)」と同じ方針で進捗送信自体を行わず、
 * 案内文のみ表示する(T-103のscrollProgress.tsと同じ判断)。
 *
 * `answers`(入力中、常に編集可能)と`checkedAnswers`(「回答する」を押した時点の
 * スナップショット)を分離して保持する。結果パネルのスコア・進捗API送信スコアは
 * 常に`checkedAnswers`から計算するため、チェック後にボタンを押さずに選択だけ
 * 変更しても表示・送信済みスコアは変化しない(qa-evaluator検出の修正、
 * components/quiz/QuizQuestionCard.tsxのコメント参照)。
 */
export function QuizRunner({
  locale,
  moduleSlug,
  moduleTitle,
  quiz,
  isAuthenticated,
}: {
  locale: Locale;
  moduleSlug: string;
  moduleTitle: string;
  quiz: Quiz;
  isAuthenticated: boolean;
}) {
  const t = getMessages(locale).quiz;
  const [answers, setAnswers] = useState<Record<string, readonly string[]>>({});
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, readonly string[]>>({});
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>("idle");

  const totalCount = quiz.questions.length;
  const allChecked = totalCount > 0 && Object.keys(checkedAnswers).length === totalCount;
  const result = allChecked ? scoreQuiz(quiz, checkedAnswers) : null;

  function handleCheck(questionId: string) {
    const nextCheckedAnswers = { ...checkedAnswers, [questionId]: answers[questionId] ?? [] };
    setCheckedAnswers(nextCheckedAnswers);

    if (
      Object.keys(nextCheckedAnswers).length === totalCount &&
      submissionStatus === "idle" &&
      isAuthenticated
    ) {
      const score = scoreQuiz(quiz, nextCheckedAnswers).score;
      setSubmissionStatus("submitting");
      submitQuizProgress({ moduleSlug, score })
        .then((outcome) => {
          setSubmissionStatus(outcome.ok ? "submitted" : "error");
        })
        .catch(() => {
          setSubmissionStatus("error");
        });
    }
  }

  if (totalCount === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold">
          {formatMessage(t.heading, { module: moduleTitle })}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">{t.emptyLabel}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {formatMessage(t.heading, { module: moduleTitle })}
      </h1>
      <div className="flex flex-col gap-4">
        {quiz.questions.map((question, index) => (
          <QuizQuestionCard
            key={question.id}
            locale={locale}
            index={index + 1}
            question={question}
            selectedOptionIds={answers[question.id] ?? []}
            checkedOptionIds={checkedAnswers[question.id]}
            checked={question.id in checkedAnswers}
            onChangeSelection={(optionIds) =>
              setAnswers((prev) => ({ ...prev, [question.id]: optionIds }))
            }
            onCheck={() => handleCheck(question.id)}
          />
        ))}
      </div>
      {result ? (
        <div
          data-testid="quiz-result"
          role="status"
          className="mt-6 rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <p className="font-semibold">
            {formatMessage(t.resultHeading, {
              correct: result.correctCount,
              total: result.totalCount,
              score: result.score,
            })}
          </p>
          {!isAuthenticated ? (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">
              {t.signInToSaveLabel}
            </p>
          ) : null}
          {isAuthenticated && submissionStatus === "submitting" ? (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">
              {t.submittingLabel}
            </p>
          ) : null}
          {isAuthenticated && submissionStatus === "submitted" ? (
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
              {t.submittedLabel}
            </p>
          ) : null}
          {isAuthenticated && submissionStatus === "error" ? (
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">{t.submitErrorLabel}</p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
