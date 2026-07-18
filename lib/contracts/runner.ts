import { z } from "zod";

/**
 * harness.worker.ts ⇄ jsRunner.ts(メインスレッド)間の postMessage コントラクト。
 * 参照設計: docs/design/02_詳細設計書.md §7.1(JSランナー構成), §7.2(採点)
 */

/** 02 §7.2 assertごとの合否1件分 */
export const RunPerTestResultSchema = z.object({
  id: z.string(),
  pass: z.boolean(),
  actual: z.string().optional(),
  error: z.string().optional(),
});
export type RunPerTestResult = z.infer<typeof RunPerTestResultSchema>;

/** 02 §7.1「console捕捉: {level, args(serialized, 200件上限)}」 */
export const RunLogEntrySchema = z.object({
  level: z.enum(["log", "warn", "error"]),
  args: z.array(z.string()),
});
export type RunLogEntry = z.infer<typeof RunLogEntrySchema>;

/**
 * メインスレッド → Worker。02 §7.1 手順1〜3。
 * 演習定義(lib/contracts/exercise.ts の ExerciseDefinition)から
 * code(ユーザー入力)・entry・tests・timeoutMsを合成して送信する。
 */
export const RunRequestSchema = z.object({
  code: z.string(),
  entry: z.string().min(1),
  tests: z.array(
    z.object({
      id: z.string(),
      args: z.array(z.unknown()),
      expected: z.unknown(),
    }),
  ),
  timeoutMs: z.number().int().positive(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

/**
 * Worker → メインスレッド。02 §7.1 手順5「構造化結果 {perTest[], logs[], durationMs}」。
 * result種別ごとにフィールドが異なるため discriminatedUnion で表現する。
 * - pass/fail: 各テスト結果 perTest を含む
 * - error: import失敗・実行時例外(§7.1 手順3)
 * - timeout: メインスレッド強制terminate(§7.1「タイムアウトの二重化」)
 */
export const RunResultSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.enum(["pass", "fail"]),
    perTest: z.array(RunPerTestResultSchema),
    logs: z.array(RunLogEntrySchema),
    durationMs: z.number().min(0),
    truncated: z.boolean().optional(),
  }),
  z.object({
    result: z.literal("error"),
    error: z.string(),
    logs: z.array(RunLogEntrySchema),
    durationMs: z.number().min(0),
  }),
  z.object({
    result: z.literal("timeout"),
    logs: z.array(RunLogEntrySchema),
    durationMs: z.number().min(0),
  }),
]);
export type RunResult = z.infer<typeof RunResultSchema>;
