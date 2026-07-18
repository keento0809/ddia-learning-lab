import { z } from "zod";
import { LocalizedTextSchema } from "./common";

/**
 * 演習定義YAML(content/{ja,en}/**\/labs/*.yaml)のコントラクト。
 * 参照設計: docs/design/02_詳細設計書.md §5.3(対管理), §7.2(採点assert種別)
 *
 * tests のロジック(id/call/assert/kind/check)は ja/en 両YAMLで
 * ハッシュ一致が必須(.claude/rules/i18n.md)。文言(name/hints)のみ
 * {ja, en} を併記する。
 */

/** 採点対象関数の呼び出し。id指定で他フィールドと紐付け */
export const ExerciseCallSchema = z.object({
  fn: z.string().min(1),
  args: z.array(z.unknown()),
});
export type ExerciseCall = z.infer<typeof ExerciseCallSchema>;

/** 02 §7.2 assert種別(equals/deepEquals/oneOf/matches)。complexityは参考表示のみで合否に不使用のためassertには含めない */
export const ExerciseAssertSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("equals"), value: z.unknown() }),
  z.object({ type: z.literal("deepEquals"), value: z.unknown() }),
  z.object({ type: z.literal("oneOf"), value: z.array(z.unknown()) }),
  z.object({ type: z.literal("matches"), value: z.string().min(1) }),
]);
export type ExerciseAssert = z.infer<typeof ExerciseAssertSchema>;

/** 呼び出し+assertによる標準テストケース。02 §5.3 例のt1相当 */
export const ExerciseAssertTestCaseSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema.optional(),
  call: ExerciseCallSchema,
  assert: ExerciseAssertSchema,
});
export type ExerciseAssertTestCase = z.infer<
  typeof ExerciseAssertTestCaseSchema
>;

/**
 * プロパティベーステストケース。02 §5.3 例のt2相当、§7.2「property」。
 * `check` は採点ハーネス内に演習ごと登録されたヘルパ(moveRatioNear等)の呼び出し式。
 */
export const ExercisePropertyTestCaseSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema,
  kind: z.literal("property"),
  check: z.string().min(1),
});
export type ExercisePropertyTestCase = z.infer<
  typeof ExercisePropertyTestCaseSchema
>;

export const ExerciseTestCaseSchema = z.union([
  ExercisePropertyTestCaseSchema,
  ExerciseAssertTestCaseSchema,
]);
export type ExerciseTestCase = z.infer<typeof ExerciseTestCaseSchema>;

/** 02 §5.3 演習定義YAML全体。language別にentry/採点方式が変わる(§7.1 JS / §7.3 SQL) */
export const ExerciseLanguageSchema = z.enum(["js", "sql"]);
export type ExerciseLanguage = z.infer<typeof ExerciseLanguageSchema>;

export const ExerciseDefinitionSchema = z.object({
  slug: z.string().min(1),
  language: ExerciseLanguageSchema,
  entry: z.string().min(1),
  template: z.string(),
  tests: z.array(ExerciseTestCaseSchema).min(1),
  timeoutMs: z.number().int().positive(),
  hints: z.array(LocalizedTextSchema).default([]),
});
export type ExerciseDefinition = z.infer<typeof ExerciseDefinitionSchema>;
