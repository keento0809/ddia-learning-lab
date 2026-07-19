import { describe, expect, it } from "vitest";
import { isQuestionCorrect, scoreQuiz } from "@/lib/quiz/scoring";
import type { Quiz } from "@/lib/quiz/schema";

/**
 * 03文書T-106 受入基準「採点ロジックの単体テスト(全問正解/部分点/0点)」。
 * DOM/API非依存の純関数(lib/quiz/scoring.ts)を直接検証する。
 */
const QUIZ: Quiz = {
  questions: [
    {
      id: "q1",
      type: "single",
      prompt: "Q1",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correctOptionIds: ["a"],
      explanation: "A is correct",
    },
    {
      id: "q2",
      type: "multiple",
      prompt: "Q2",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      correctOptionIds: ["a", "b"],
      explanation: "A and B are correct",
    },
    {
      id: "q3",
      type: "single",
      prompt: "Q3",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correctOptionIds: ["b"],
      explanation: "B is correct",
    },
  ],
};

describe("isQuestionCorrect", () => {
  it("returns true only when the selected set exactly matches the correct set", () => {
    const question = QUIZ.questions[1]!; // multiple, correct = [a, b]
    expect(isQuestionCorrect(question, ["a", "b"])).toBe(true);
    expect(isQuestionCorrect(question, ["b", "a"])).toBe(true); // order-independent
  });

  it("treats a partial multi-select as incorrect (no partial credit within one question)", () => {
    const question = QUIZ.questions[1]!;
    expect(isQuestionCorrect(question, ["a"])).toBe(false);
  });

  it("treats an over-selection as incorrect", () => {
    const question = QUIZ.questions[1]!;
    expect(isQuestionCorrect(question, ["a", "b", "c"])).toBe(false);
  });

  it("treats no selection as incorrect", () => {
    expect(isQuestionCorrect(QUIZ.questions[0]!, [])).toBe(false);
  });
});

describe("scoreQuiz", () => {
  it("scores 100 when every question is answered correctly (全問正解)", () => {
    const result = scoreQuiz(QUIZ, {
      q1: ["a"],
      q2: ["a", "b"],
      q3: ["b"],
    });
    expect(result).toEqual({
      score: 100,
      correctCount: 3,
      totalCount: 3,
      results: [
        { questionId: "q1", correct: true },
        { questionId: "q2", correct: true },
        { questionId: "q3", correct: true },
      ],
    });
  });

  it("scores a partial result when only some questions are correct (部分点)", () => {
    const result = scoreQuiz(QUIZ, {
      q1: ["a"], // correct
      q2: ["a"], // incorrect (partial multi-select)
      q3: ["a"], // incorrect
    });
    expect(result.correctCount).toBe(1);
    expect(result.totalCount).toBe(3);
    expect(result.score).toBe(33); // round(1/3 * 100)
  });

  it("scores 0 when every question is answered incorrectly (0点)", () => {
    const result = scoreQuiz(QUIZ, {
      q1: ["b"],
      q2: ["c"],
      q3: ["a"],
    });
    expect(result.score).toBe(0);
    expect(result.correctCount).toBe(0);
  });

  it("scores 0 for unanswered questions without throwing", () => {
    const result = scoreQuiz(QUIZ, {});
    expect(result.score).toBe(0);
    expect(result.correctCount).toBe(0);
    expect(result.totalCount).toBe(3);
  });

  it("returns 0 (not NaN) for a quiz with no questions", () => {
    const result = scoreQuiz({ questions: [] }, {});
    expect(result).toEqual({ score: 0, correctCount: 0, totalCount: 0, results: [] });
  });
});
