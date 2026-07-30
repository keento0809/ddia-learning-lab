import { z } from "zod";

/**
 * quiz.yaml(content/{ja,en}/**\/quiz.yaml)のコントラクト。
 * 参照設計: docs/design/03_実装タスク分割書.md T-106「quiz.yaml描画」。
 *
 * T-106実施時点ではquiz.yamlの構造がlib/contracts/に未確定だったため、
 * T-106検証専用のローカルスキーマ(lib/quiz/schema.ts)として暫定実装していた
 * (STATUS.md 2026-07-18/07-19決定事項ログ)。T-011にて本ファイルへ正式に
 * 昇格し、T-106実装(lib/quiz/content.ts, lib/quiz.ts, lib/quiz/scoring.ts,
 * components/quiz/*)とT-006のコンテンツパイプライン(lib/content.ts)の
 * 双方がこの単一契約を参照する(フィールド・検証ロジックは昇格前から変更なし)。
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
