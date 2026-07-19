"use client";

import type { QuizQuestion } from "@/lib/quiz/schema";
import { isQuestionCorrect } from "@/lib/quiz/scoring";
import type { Locale } from "@/lib/i18n/messages";
import { getMessages } from "@/lib/i18n/messages";

/**
 * S-05 クイズ(T-106)。1問分の選択・即時フィードバック+解説。
 * `components/mdx/QuizInline.tsx`(T-103、本文中1問クイズ)と同じ
 * 「選択→回答する→フィードバック表示」というUXパターンを踏襲しつつ、
 * type='multiple'のチェックボックス選択を追加サポートする。
 *
 * キーボード操作: ネイティブ`<input type="radio"/checkbox">`+`<label>`を
 * 使用するため、Tab/Space/矢印キーによる選択、Tabでの「回答する」ボタン到達・
 * Enter/Spaceでの実行がブラウザ標準の挙動として成立する(追加のキーハンドラ不要)。
 *
 * `selectedOptionIds`(入力中の選択、常に編集可能)と`checkedOptionIds`
 * (直近に「回答する」を押した時点のスナップショット、フィードバック判定に使用)を
 * 分離している。分離しない場合、チェック後にボタンを押さずに選択だけ変更すると
 * 正誤表示が毎レンダー再計算されて無言で切り替わってしまう
 * (qa-evaluator検出: 「もう一度確認する」ボタンが実質無意味になり、誤答→消去法で
 * 正解を確認→無言で正解に切替、というスコア水増しが可能だった)。
 */
export function QuizQuestionCard({
  locale,
  index,
  question,
  selectedOptionIds,
  checkedOptionIds,
  checked,
  onChangeSelection,
  onCheck,
}: {
  locale: Locale;
  index: number;
  question: QuizQuestion;
  selectedOptionIds: readonly string[];
  /** 直近の「回答する」クリック時点の選択スナップショット。未チェック時はundefined */
  checkedOptionIds: readonly string[] | undefined;
  checked: boolean;
  onChangeSelection: (optionIds: readonly string[]) => void;
  onCheck: () => void;
}) {
  const t = getMessages(locale).quiz;
  const isCorrect = checked && isQuestionCorrect(question, checkedOptionIds ?? []);
  const groupName = `quiz-question-${question.id}`;
  const legendId = `${groupName}-legend`;

  function toggleOption(optionId: string) {
    if (question.type === "single") {
      onChangeSelection([optionId]);
      return;
    }
    const next = selectedOptionIds.includes(optionId)
      ? selectedOptionIds.filter((id) => id !== optionId)
      : [...selectedOptionIds, optionId];
    onChangeSelection(next);
  }

  return (
    <fieldset
      data-testid={`quiz-question-${question.id}`}
      className="rounded border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <legend id={legendId} className="mb-3 font-semibold">
        {`${index}. ${question.prompt}`}
      </legend>
      <div
        role={question.type === "single" ? "radiogroup" : "group"}
        aria-labelledby={legendId}
        className="flex flex-col gap-2"
      >
        {question.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type={question.type === "single" ? "radio" : "checkbox"}
              name={groupName}
              value={option.id}
              checked={selectedOptionIds.includes(option.id)}
              onChange={() => toggleOption(option.id)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        data-testid={`quiz-question-${question.id}-check`}
        disabled={selectedOptionIds.length === 0}
        onClick={onCheck}
        className="mt-3 rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {checked ? t.recheckLabel : t.checkLabel}
      </button>
      {checked ? (
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
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            {`${t.explanationHeading}: ${question.explanation}`}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
