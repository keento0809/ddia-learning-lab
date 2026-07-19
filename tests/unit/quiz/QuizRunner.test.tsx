import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import type { Quiz } from "@/lib/quiz/schema";

const QUIZ: Quiz = {
  questions: [
    {
      id: "q1",
      type: "single",
      prompt: "問題1",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correctOptionIds: ["a"],
      explanation: "説明1",
    },
    {
      id: "q2",
      type: "multiple",
      prompt: "問題2",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correctOptionIds: ["a", "b"],
      explanation: "説明2",
    },
  ],
};

describe("QuizRunner", () => {
  it("renders the module heading and every question before any interaction, without a result section", () => {
    const html = renderToStaticMarkup(
      <QuizRunner
        locale="ja"
        moduleSlug="01-reliability"
        moduleTitle="信頼性"
        quiz={QUIZ}
        isAuthenticated={true}
      />,
    );
    expect(html).toContain("信頼性");
    expect(html).toContain("問題1");
    expect(html).toContain("問題2");
    expect(html).not.toContain('data-testid="quiz-result"');
  });

  it("renders the empty state when the quiz has no questions", () => {
    const html = renderToStaticMarkup(
      <QuizRunner
        locale="en"
        moduleSlug="01-reliability"
        moduleTitle="Reliability"
        quiz={{ questions: [] }}
        isAuthenticated={true}
      />,
    );
    expect(html).toContain("coming soon");
    expect(html).not.toContain('data-testid="quiz-question-q1"');
  });
});
