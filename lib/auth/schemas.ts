import { z } from "zod";

/**
 * T-005認証まわりのAPI入出力スキーマ。lib/contracts/はT-010完了以降変更禁止
 * (CLAUDE.md規則2)のため、認証専用の型はここに置く。
 */

export const EmailSchema = z.string().trim().toLowerCase().email();

/** 02§2.1 users.display_name varchar(50) */
export const DisplayNameSchema = z.string().trim().min(1).max(50);

/** OWASP ASVS L1相当の最小要件(02§1「セキュリティ」)。上限はDoS対策 */
export const PasswordSchema = z.string().min(8).max(128);

export const SignupRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema,
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SignupResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type SignupResponse = z.infer<typeof SignupResponseSchema>;

export const CredentialsSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

export const ResetRequestSchema = z.object({
  email: EmailSchema,
});
export type ResetRequest = z.infer<typeof ResetRequestSchema>;

export const ResetConfirmRequestSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type ResetConfirmRequest = z.infer<typeof ResetConfirmRequestSchema>;
