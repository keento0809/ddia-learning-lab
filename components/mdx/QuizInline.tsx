"use client";

import { useState } from "react";
import { getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";

export interface QuizInlineOption {
  id: string;
  label: string;
}

/**
 * MDXカスタムコンポーネント<QuizInline>(T-103, 02§4.1)。本文中1問クイズ。
 * quiz.yaml(S-05, T-106)とは独立した自己完結型コンポーネント: 問題文・選択肢・
 * 正解・解説はすべてMDX呼び出し側のprops(=ロケール別MDXファイル内のcontent、
 * 02§8「教材本文はロケール別MDX」)として与える。進捗API接続はOut of
 * Scope(T-105)のため採点結果はどこにも送信しない(画面内フィードバックのみ)。
 */
export function QuizInline({
  id,
  prompt,
  options,
  correctOptionId,
  explanation,
}: {
  id: string;
  prompt: string;
  options: QuizInlineOption[];
  correctOptionId: string;
  explanation?: string;
}) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.quizInline;
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = submitted && selected === correctOptionId;

  return (
    <div
      data-testid={`quiz-inline-${id}`}
      className="my-6 rounded border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <p className="mb-3 font-semibold">{prompt}</p>
      <div role="radiogroup" aria-label={prompt} className="flex flex-col gap-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`quiz-inline-${id}`}
              value={option.id}
              checked={selected === option.id}
              onChange={() => {
                setSelected(option.id);
                setSubmitted(false);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        data-testid={`quiz-inline-${id}-submit`}
        disabled={!selected}
        onClick={() => setSubmitted(true)}
        className="mt-3 rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {t.submitLabel}
      </button>
      {submitted ? (
        <div className="mt-3 text-sm" role="status">
          <p
            className={
              isCorrect
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400"
            }
          >
            {isCorrect ? t.correctLabel : t.incorrectLabel}
          </p>
          {!isCorrect ? (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{t.retryLabel}</p>
          ) : null}
          {explanation ? (
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              {`${t.explanationHeading}: ${explanation}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
