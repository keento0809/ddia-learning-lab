import { describe, expect, it } from "vitest";
import { QuizSchema } from "@/lib/contracts/quiz";

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

  it("parses a valid quiz.yaml payload", () => {
    const result = QuizSchema.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
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
