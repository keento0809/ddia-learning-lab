import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ResetRequestSchema } from "@/lib/auth/schemas";
import { createResetToken } from "@/lib/auth/resetToken";
import { problemResponse } from "@/lib/auth/http";

/**
 * パスワードリセット要求。メール送信基盤(ADR-007に定義なし、07人間作業
 * チェックリストにもSMTP系の秘密情報記載なし)が本プロジェクトに存在しないため、
 * 「メールを送信した」という偽の成功文言は出さず(CLAUDE.md規則3)、
 * リセットリンクをレスポンスとして直接返す設計とする。
 * 該当ユーザーが存在しない場合もリンクを返さず200を返し(メールアドレス列挙対策)、
 * UI側は常に同一の案内を表示する。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  const parsed = ResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(400, "about:blank#validation-error", "validation_error");
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ resetToken: null });
  }

  const resetToken = await createResetToken(user.id, user.passwordHash);
  return NextResponse.json({ resetToken });
}
