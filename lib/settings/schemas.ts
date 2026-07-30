import { z } from "zod";
import { DisplayNameSchema } from "@/lib/auth/schemas";

/**
 * T-308設定画面(S-10)のAPI入出力スキーマ。lib/contracts/はT-010完了以降
 * 変更禁止(CLAUDE.md規則2)のため、lib/auth/schemas.tsと同じ方針で
 * 設定専用の型はここに置く。
 */

/** 02§2.1 users.locale_pref varchar(5) 'ja'/'en' */
export const LocalePrefSchema = z.enum(["ja", "en"]);
export type LocalePref = z.infer<typeof LocalePrefSchema>;

/** 02§2.1 users.theme_pref varchar(10) default 'system' */
export const ThemePrefSchema = z.enum(["system", "light", "dark"]);
export type ThemePref = z.infer<typeof ThemePrefSchema>;

export const AccountRecordSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: DisplayNameSchema,
  localePref: LocalePrefSchema,
  themePref: ThemePrefSchema,
});
export type AccountRecord = z.infer<typeof AccountRecordSchema>;

export const GetAccountResponseSchema = z.object({
  account: AccountRecordSchema,
});
export type GetAccountResponse = z.infer<typeof GetAccountResponseSchema>;

/** PATCH /api/account。表示名・言語既定値・テーマ既定値のうち1つ以上を部分更新する。 */
export const PatchAccountRequestSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    localePref: LocalePrefSchema.optional(),
    themePref: ThemePrefSchema.optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.localePref !== undefined || value.themePref !== undefined,
    { message: "displayName, localePref, themePrefのいずれか1つ以上が必要です" },
  );
export type PatchAccountRequest = z.infer<typeof PatchAccountRequestSchema>;

export const PatchAccountResponseSchema = GetAccountResponseSchema;
export type PatchAccountResponse = z.infer<typeof PatchAccountResponseSchema>;

/**
 * DELETE /api/account。「タイプ確認式」の確認ダイアログ(登録済みメールアドレスを
 * 入力させる)をサーバ側でも検証する(クライアント側の入力ゲートのみに頼らない
 * 防御的多層化)。
 */
export const DeleteAccountRequestSchema = z.object({
  confirmationEmail: z.string().trim().min(1),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

export const DeleteAccountResponseSchema = z.object({
  status: z.literal("ok"),
});
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
