import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import { loadQuiz } from "@/lib/quiz/content";
import { QuizSchema } from "@/lib/quiz/schema";

const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/quiz", import.meta.url));

describe("loadQuiz", () => {
  it.each([["ja"], ["en"]] as const)(
    "loads and validates a real quiz.yaml fixture (locale=%s)",
    (locale) => {
      const mod = loadAllModules(FIXTURES_ROOT, locale).find((m) => m.slug === "01-reliability");
      expect(mod?.quizFilePath).toBeTruthy();
      const quiz = loadQuiz(mod!.quizFilePath!);
      expect(quiz.questions).toHaveLength(2);
      expect(quiz.questions[0]!.type).toBe("single");
      expect(quiz.questions[1]!.type).toBe("multiple");
    },
  );
});

describe("QuizSchema", () => {
  const validQuestion = {
    id: "q1",
    type: "single" as const,
    prompt: "prompt",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    correctOptionIds: ["a"],
    explanation: "because a",
  };

  it("accepts an empty questions array (content未投入時の空状態)", () => {
    expect(QuizSchema.safeParse({ questions: [] }).success).toBe(true);
  });

  it("rejects a single-type question with more than one correct option", () => {
    const result = QuizSchema.safeParse({
      questions: [{ ...validQuestion, correctOptionIds: ["a", "b"] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects correctOptionIds that reference an option not present in options", () => {
    const result = QuizSchema.safeParse({
      questions: [{ ...validQuestion, correctOptionIds: ["z"] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const result = QuizSchema.safeParse({
      questions: [
        {
          ...validQuestion,
          options: [
            { id: "a", label: "A" },
            { id: "a", label: "A duplicate" },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a multiple-type question with more than one correct option", () => {
    const result = QuizSchema.safeParse({
      questions: [{ ...validQuestion, type: "multiple", correctOptionIds: ["a", "b"] }],
    });
    expect(result.success).toBe(true);
  });
});
