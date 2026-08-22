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

  /**
   * 失敗→恒久対策(モバイル診断): 「回答する」ボタンがpx-3 py-1 text-smのみ
   * だと実測高さ28pxとなり、44pxのタップ領域基準(WCAG 2.5.5相当)を
   * 下回っていた。min-h-[44px]でボタンの最小高さを固定する。
   */
  it("gives the submit button a minimum 44px tap target", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <QuizInline
          id="q3"
          prompt="タップ領域確認用"
          options={OPTIONS}
          correctOptionId="a"
        />
      </LessonLocaleProvider>,
    );
    const buttonMatch = html.match(
      /<button[^>]*data-testid="quiz-inline-q3-submit"[^>]*class="([^"]*)"/,
    );
    expect(buttonMatch).not.toBeNull();
    expect(buttonMatch![1]).toContain("min-h-[44px]");
  });
});
