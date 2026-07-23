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
 *
 * ADR-008(docs/design/09)T-503: このモジュールはworker-api(workers/api/src/routes/
 * internalAuth.ts)からも呼ばれる共有ロジック。Cloudflare Workers(workerd)には
 * `process.env`が存在しないため、secretは呼び出し側から明示的に渡す
 * (worker-appはprocess.env.AUTH_SECRET、worker-apiはc.env.AUTH_SECRETをそれぞれ渡す)。
 */

const PURPOSE = "password-reset";
const TTL_SECONDS = 60 * 60; // 1時間

function digestPasswordHash(passwordHash: string | null): string {
  return createHash("sha256").update(passwordHash ?? "").digest("hex");
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createResetToken(
  userId: string,
  currentPasswordHash: string | null,
  secret: string,
) {
  return new SignJWT({
    purpose: PURPOSE,
    pwd: digestPasswordHash(currentPasswordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey(secret));
}

export async function verifyResetToken(
  token: string,
  currentPasswordHash: string | null,
  secret: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret));
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

/**
 * 署名検証前にsub(userId)だけを取り出す。トークンからユーザーを特定しないと
 * currentPasswordHashが得られず検証できないため(verifyResetTokenのコメント参照)、
 * 検証前の値として扱う前提で呼び出し側(internalAuth.ts)が使う。
 */
export function decodeUnverifiedSubject(token: string): string | null {
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
