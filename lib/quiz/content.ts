import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";
import { ContentValidationError } from "@/lib/content";
import { QuizSchema, type Quiz } from "./schema";

/**
 * quiz.yamlのビルド時ロード(scripts/generate-curriculum.ts専用、Node CLIからのみ使用)。
 * lib/content.tsのreadYaml/formatZodIssuesと同じ構造検証パターンを踏襲するが、
 * quiz.yamlの構造はlib/contracts/未確定(lib/quiz/schema.tsのコメント参照)のため
 * lib/content.ts自体は変更せず、ここへ独立実装する。
 */
function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(", ");
}

export function loadQuiz(quizFilePath: string): Quiz {
  const raw = fs.readFileSync(quizFilePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ContentValidationError(
      `YAMLの解析に失敗しました: ${(err as Error).message}`,
      quizFilePath,
    );
  }
  const result = QuizSchema.safeParse(parsed);
  if (!result.success) {
    throw new ContentValidationError(
      `quiz.yamlのスキーマが不正です: ${formatZodIssues(result.error)}`,
      quizFilePath,
    );
  }
  return result.data;
}
