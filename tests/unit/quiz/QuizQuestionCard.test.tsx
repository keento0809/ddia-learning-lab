import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizQuestionCard } from "@/components/quiz/QuizQuestionCard";
import type { QuizQuestion } from "@/lib/quiz/schema";

const SINGLE: QuizQuestion = {
  id: "q1",
  type: "single",
  prompt: "単一選択の問題文",
  options: [
    { id: "a", label: "選択肢A" },
    { id: "b", label: "選択肢B" },
  ],
  correctOptionIds: ["a"],
  explanation: "Aが正解の理由",
};

const MULTIPLE: QuizQuestion = {
  id: "q2",
  type: "multiple",
  prompt: "複数選択の問題文",
  options: [
    { id: "a", label: "選択肢A" },
    { id: "b", label: "選択肢B" },
    { id: "c", label: "選択肢C" },
  ],
  correctOptionIds: ["a", "b"],
  explanation: "AとBが正解の理由",
};

describe("QuizQuestionCard", () => {
  it("renders a radiogroup with radio inputs for a single-choice question, disabled check button before selection", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="ja"
        index={1}
        question={SINGLE}
        selectedOptionIds={[]}
        checkedOptionIds={undefined}
        checked={false}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('type="radio"');
    expect(html).toContain("単一選択の問題文");
    expect(html).toContain('data-testid="quiz-question-q1-check"');
    // ボタンのTailwindクラス"disabled:opacity-40"にも"disabled"が部分一致するため、
    // 実際のdisabled属性の有無はdisabled=""(boolean属性のSSR表現)で判定する。
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('role="status"');
  });

  it("renders a checkbox group for a multiple-choice question", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="en"
        index={2}
        question={MULTIPLE}
        selectedOptionIds={["a"]}
        checkedOptionIds={undefined}
        checked={false}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('type="checkbox"');
    // at least one option selected -> check button enabled (no disabled="" boolean attribute)
    expect(html).not.toContain('disabled=""');
  });

  it("shows correct feedback and the explanation once checked with the right answer", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="ja"
        index={1}
        question={SINGLE}
        selectedOptionIds={["a"]}
        checkedOptionIds={["a"]}
        checked={true}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("正解です");
    expect(html).toContain("Aが正解の理由");
  });

  it("shows incorrect feedback once checked with the wrong answer", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="ja"
        index={1}
        question={SINGLE}
        selectedOptionIds={["b"]}
        checkedOptionIds={["b"]}
        checked={true}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain("不正解です");
  });

  it("treats a partial multi-select as incorrect when checked", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="en"
        index={2}
        question={MULTIPLE}
        selectedOptionIds={["a"]}
        checkedOptionIds={["a"]}
        checked={true}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain("Not quite");
  });

  /**
   * qa-evaluator検出の回帰テスト: 「回答する」を押した後、ボタンを再度押さずに
   * 選択(selectedOptionIds)だけを変えても、フィードバックは直近チェック時点の
   * スナップショット(checkedOptionIds)に基づくべきで、ライブの選択に追従して
   * 無言で切り替わってはならない。
   */
  it("keeps showing the feedback for the checked snapshot even when the live selection has since changed", () => {
    const html = renderToStaticMarkup(
      <QuizQuestionCard
        locale="ja"
        index={1}
        question={SINGLE}
        selectedOptionIds={["a"]} // live selection was silently changed to the correct answer...
        checkedOptionIds={["b"]} // ...but the last *checked* snapshot was still the wrong one
        checked={true}
        onChangeSelection={() => {}}
        onCheck={() => {}}
      />,
    );
    // feedback must follow the frozen snapshot (incorrect), not the live selection (correct).
    // Note: "不正解です" contains "正解です" as a substring, so we assert on the
    // distinguishing CSS class (red vs emerald) rather than substring-matching the text.
    expect(html).toContain("不正解です");
    expect(html).toContain("text-red-700");
    expect(html).not.toContain("text-emerald-700");
  });
});
