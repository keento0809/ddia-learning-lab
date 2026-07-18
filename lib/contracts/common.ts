import { z } from "zod";

/**
 * 全コントラクト共通のプリミティブ型。
 * 参照設計: docs/design/02_詳細設計書.md §3(API), §5.3(コンテンツ), §5.4(用語集)
 */

/** サポートするロケール。02 §5.1 ルーティング */
export const LocaleSchema = z.enum(["ja", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * ja/en 対訳テキスト。演習YAMLの文言(テスト名・ヒント等、02 §5.3)や
 * 用語集(02 §5.4)など、ロジックは共有し文言のみ両言語持つ箇所で使用する。
 */
export const LocalizedTextSchema = z.object({
  ja: z.string(),
  en: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/**
 * API エラーレスポンス形式。02 §3「エラーは RFC 9457 Problem Details 形式」。
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
