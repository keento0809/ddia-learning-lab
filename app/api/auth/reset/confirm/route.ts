import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { ResetConfirmRequestSchema } from "@/lib/auth/schemas";
import { verifyResetToken } from "@/lib/auth/resetToken";
import { problemResponse } from "@/lib/auth/http";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  const parsed = ResetConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(400, "about:blank#validation-error", "validation_error");
  }

  const { token, password } = parsed.data;

  // トークンは発行時点のpasswordHashダイジェストを含むため、まず対象ユーザーを
  // 特定せずには検証できない。JWTのsub(userId)は署名検証前は信頼できないが、
  // verifyResetTokenは署名検証後にのみpayloadを返すため、後段のuserId取得は安全。
  const unverifiedSub = decodeSubWithoutVerifying(token);
  const user = unverifiedSub
    ? await prisma.user.findUnique({ where: { id: unverifiedSub } })
    : null;
  if (!user || user.deletedAt) {
    return problemResponse(400, "about:blank#invalid-token", "invalid_or_expired_token");
  }

  const verified = await verifyResetToken(token, user.passwordHash);
  if (!verified || verified.userId !== user.id) {
    return problemResponse(400, "about:blank#invalid-token", "invalid_or_expired_token");
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ status: "ok" });
}

function decodeSubWithoutVerifying(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
