import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import { loadQuiz } from "@/lib/quiz/content";

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
