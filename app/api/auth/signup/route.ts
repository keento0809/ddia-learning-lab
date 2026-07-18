import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { SignupRequestSchema } from "@/lib/auth/schemas";
import { problemResponse } from "@/lib/auth/http";

/**
 * 03文書T-005受入基準「サインアップ→ログイン→セッション取得のAPI統合テスト」の起点。
 * 02§1「認証はセッションCookie」の対象外(ログイン前のためCredentialsProviderの
 * 対象外エンドポイント)。作成後のログインはクライアントがsignIn("credentials")を
 * 別途呼び出す(このエンドポイントはユーザー作成のみを担う)。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  const parsed = SignupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const { email, password, displayName } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return problemResponse(409, "about:blank#email-taken", "email_taken");
    }
    throw error;
  }
}
