import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizInline } from "@/components/mdx/QuizInline";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

const OPTIONS = [
  { id: "a", label: "選択肢A" },
  { id: "b", label: "選択肢B" },
];

describe("QuizInline", () => {
  it("renders the prompt, options and a disabled submit button before any selection", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <QuizInline
          id="q1"
          prompt="正しいものはどれ?"
          options={OPTIONS}
          correctOptionId="a"
          explanation="Aが正解の理由(テスト用)。"
        />
      </LessonLocaleProvider>,
    );
    expect(html).toContain("正しいものはどれ?");
    expect(html).toContain("選択肢A");
    expect(html).toContain("選択肢B");
    expect(html).toContain('data-testid="quiz-inline-q1-submit"');
    expect(html).toContain("disabled");
    expect(html).not.toContain('role="status"');
  });

  it("does not show correct/incorrect feedback before submission (feedback is post-interaction only)", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="en">
        <QuizInline id="q2" prompt="Which is correct?" options={OPTIONS} correctOptionId="b" />
      </LessonLocaleProvider>,
    );
    expect(html).not.toContain("Correct!");
    expect(html).not.toContain("Not quite");
  });
});
