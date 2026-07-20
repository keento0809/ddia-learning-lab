import { describe, expect, it } from "vitest";
import { encode } from "@auth/core/jwt";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/workers/api/src/auth";

/**
 * workers/api/src/auth.ts の検証。lib/auth/config.ts(Auth.js, JWT戦略)が
 * 発行するセッションCookieと同一のencode/salt/secretで生成したトークンを使い、
 * worker-api側のverifySessionCookieが実際のAuth.js発行トークンを正しく検証できる
 * ことを確認する(ADR-008 §2)。
 */

const SECRET = "test-auth-secret-0123456789abcdef";

async function issueToken(overrides: { uid?: string; maxAge?: number } = {}) {
  return encode({
    token: overrides.uid === undefined ? {} : { uid: overrides.uid },
    secret: SECRET,
    salt: SESSION_COOKIE_NAME,
    maxAge: overrides.maxAge,
  });
}

describe("verifySessionCookie", () => {
  it("有効なAuth.js発行トークンからuserIdを取り出す", async () => {
    const token = await issueToken({ uid: "user-123" });
    const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECRET);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("Cookieヘッダが存在しない場合はnull", async () => {
    const result = await verifySessionCookie(null, SECRET);
    expect(result).toBeNull();
  });

  it("対象Cookie名が含まれない場合はnull", async () => {
    const result = await verifySessionCookie("other-cookie=abc", SECRET);
    expect(result).toBeNull();
  });

  it("他のCookieと同居していても対象Cookieを取り出せる", async () => {
    const token = await issueToken({ uid: "user-456" });
    const result = await verifySessionCookie(
      `theme=dark; ${SESSION_COOKIE_NAME}=${token}; locale=ja`,
      SECRET,
    );
    expect(result).toEqual({ userId: "user-456" });
  });

  it("secretが異なると検証に失敗しnull", async () => {
    const token = await issueToken({ uid: "user-123" });
    const result = await verifySessionCookie(
      `${SESSION_COOKIE_NAME}=${token}`,
      "wrong-secret-fedcba9876543210",
    );
    expect(result).toBeNull();
  });

  it("有効期限切れのトークンはnull", async () => {
    const token = await issueToken({ uid: "user-123", maxAge: -60 });
    const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECRET);
    expect(result).toBeNull();
  });

  it("uidクレームを含まないトークンはnull", async () => {
    const token = await issueToken({});
    const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECRET);
    expect(result).toBeNull();
  });

  it("不正な文字列トークンはnull", async () => {
    const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=not-a-real-jwt`, SECRET);
    expect(result).toBeNull();
  });
});
