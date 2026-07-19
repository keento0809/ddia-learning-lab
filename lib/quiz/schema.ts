import { z } from "zod";

/**
 * quiz.yaml(content/{ja,en}/**\/quiz.yaml)のローカルスキーマ。
 * 参照設計: docs/design/03_実装タスク分割書.md T-106「quiz.yaml描画」。
 *
 * T-010決定事項ログ(STATUS.md 2026-07-18)およびT-006決定事項ログ
 * (STATUS.md 2026-07-19)により、quiz.yamlの構造は公式contract
 * (lib/contracts/)として未確定のまま据え置かれている(02文書がフィールドを
 * 定義していないため)。CLAUDE.md規則2によりlib/contracts/は変更できないため、
 * module.yamlがT-006〜T-101間で辿った手順(T-006がlib/content.ts内に
 * ローカルスキーマを定義→後続タスクが正式contract化)と同じく、
 * T-106は自身のレンダリングに必要な最小スキーマをlib/quiz/にローカル定義する。
 * lib/contracts/への昇格要否は別途判断されるまで据え置く。
 */
export const QuizOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type QuizOption = z.infer<typeof QuizOptionSchema>;

export const QuizQuestionTypeSchema = z.enum(["single", "multiple"]);
export type QuizQuestionType = z.infer<typeof QuizQuestionTypeSchema>;

export const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: QuizQuestionTypeSchema,
    prompt: z.string().min(1),
    options: z.array(QuizOptionSchema).min(2),
    correctOptionIds: z.array(z.string().min(1)).min(1),
    explanation: z.string().min(1),
  })
  .superRefine((question, ctx) => {
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "optionsのidが重複しています",
      });
    }
    for (const correctId of question.correctOptionIds) {
      if (!optionIds.has(correctId)) {
        ctx.addIssue({
          code: "custom",
          path: ["correctOptionIds"],
          message: `correctOptionIds '${correctId}' がoptionsに存在しません`,
        });
      }
    }
    if (question.type === "single" && question.correctOptionIds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOptionIds"],
        message: "type='single'のcorrectOptionIdsは1件である必要があります",
      });
    }
  });
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const QuizSchema = z.object({
  questions: z.array(QuizQuestionSchema),
});
export type Quiz = z.infer<typeof QuizSchema>;
