import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";

/**
 * パスワードリセット用のステートレストークン。02§2.1の8テーブル(T-004で確定済み)
 * にリセットトークン用テーブルは存在せず、本タスクでのスキーマ追加は行わない
 * (CLAUDE.md規則1: Out of Scope機能追加の禁止)ため、DB保存なしのJWTで表現する。
 *
 * 「使い切り」制約は、発行時点のpasswordHashのダイジェストをクレームに含め、
 * 検証時に現在のpasswordHashと一致するかを照合することで満たす
 * (リセット成功でpasswordHashが変わるため、同じトークンは再利用できなくなる)。
 */

const PURPOSE = "password-reset";
const TTL_SECONDS = 60 * 60; // 1時間

function digestPasswordHash(passwordHash: string | null): string {
  return createHash("sha256").update(passwordHash ?? "").digest("hex");
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createResetToken(userId: string, currentPasswordHash: string | null) {
  return new SignJWT({
    purpose: PURPOSE,
    pwd: digestPasswordHash(currentPasswordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyResetToken(
  token: string,
  currentPasswordHash: string | null,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      payload.purpose !== PURPOSE ||
      typeof payload.sub !== "string" ||
      payload.pwd !== digestPasswordHash(currentPasswordHash)
    ) {
      return null;
    }
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
