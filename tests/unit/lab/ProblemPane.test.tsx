import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProblemPane } from "@/components/lab/ProblemPane";
import { getDemoExercise } from "@/lib/lab/demoExercise";

const exercise = getDemoExercise("ja");

function render(props: Partial<Parameters<typeof ProblemPane>[0]> = {}) {
  return renderToStaticMarkup(
    <ProblemPane
      exercise={exercise}
      activeTab="problem"
      onTabChange={() => {}}
      failCount={0}
      passed={false}
      explanationRevealed={false}
      onRevealExplanation={() => {}}
      locale="ja"
      {...props}
    />,
  );
}

// T-108受入基準(7)「ヒント段階開放(失敗2回でHint1、5回でHint2)」
describe("ProblemPane hints tab", () => {
  it("reveals no hints before the first threshold", () => {
    const html = render({ activeTab: "hints", failCount: 1 });
    expect(html).not.toContain('data-testid="lab-hint-1"');
    expect(html).toContain('data-testid="lab-hint-locked"');
  });

  it("reveals hint 1 at the first threshold (2 failures)", () => {
    const html = render({ activeTab: "hints", failCount: 2 });
    expect(html).toContain('data-testid="lab-hint-1"');
    expect(html).not.toContain('data-testid="lab-hint-2"');
  });

  it("reveals both hints at the second threshold (5 failures)", () => {
    const html = render({ activeTab: "hints", failCount: 5 });
    expect(html).toContain('data-testid="lab-hint-1"');
    expect(html).toContain('data-testid="lab-hint-2"');
  });
});

// 02§4.2「解説タブは合格後 or「解説を見る」で開放」
describe("ProblemPane explanation tab", () => {
  it("is locked (with a reveal button) before passing", () => {
    const html = render({ activeTab: "explanation", passed: false, explanationRevealed: false });
    expect(html).toContain('data-testid="lab-explanation-locked"');
    expect(html).toContain('data-testid="lab-reveal-explanation"');
  });

  it("unlocks once passed, even without explicit reveal", () => {
    const html = render({ activeTab: "explanation", passed: true, explanationRevealed: false });
    expect(html).toContain('data-testid="lab-explanation-body"');
  });

  it("unlocks via explicit reveal even without passing", () => {
    const html = render({ activeTab: "explanation", passed: false, explanationRevealed: true });
    expect(html).toContain('data-testid="lab-explanation-body"');
  });

  it("is honest about the absence of prose explanation content (no fabricated text)", () => {
    const html = render({ activeTab: "explanation", passed: true });
    expect(html).toContain("この演習の解説はまだ用意されていません");
  });
});

describe("ProblemPane problem tab", () => {
  it("derives examples from equals-style tests without fabricating prose", () => {
    const html = render({ activeTab: "problem" });
    expect(html).toContain("clamp");
    expect(html).toContain("入出力例");
  });
});
