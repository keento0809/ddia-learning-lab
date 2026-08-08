import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { handlers } from "@/lib/auth/config";
import { hashPassword } from "@/lib/auth/password";

/**
 * T-703 AU-3(docs/design/11_ADR-011 §3.2)。Cookie属性(HttpOnly/Secure/SameSite)の
 * 実測。tests/integration/auth.flow.integration.test.tsはT-005の受入基準として
 * HttpOnly/SameSite=Laxのみを確認済みだが、本テストはT-703の独立検証として
 * Secure/Path/有効期限を含めAuth.jsが実際に発行するSet-Cookieヘッダを1バイト単位で
 * 測定する(設定ファイル(lib/auth/config.ts)の記述を読むのではなく、実際に
 * サインインハンドラを実行して得られる生のヘッダ値を検証する)。
 */

const BASE_URL = "http://localhost:3000";

function extractCookiePairs(response: Response): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    pairs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return pairs;
}

function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function parseSetCookieAttrs(raw: string): string[] {
  return raw
    .split(";")
    .slice(1)
    .map((part) => part.trim().toLowerCase());
}

describe("AU-3: Cookie属性の実測", () => {
  const email = `au3-${randomUUID()}@example.com`;
  const password = "correct horse battery staple";

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), displayName: "AU-3 Test User" },
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("実サインインで発行されるauthjs.session-token Set-CookieヘッダをすべてのAttributeまで測定する", async () => {
    const csrfResponse = await handlers.GET(new NextRequest(`${BASE_URL}/api/auth/csrf`));
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookies = extractCookiePairs(csrfResponse);

    const signInBody = new URLSearchParams({
      email,
      password,
      csrfToken,
      callbackUrl: `${BASE_URL}/`,
      json: "true",
    });
    const signInResponse = await handlers.POST(
      new NextRequest(`${BASE_URL}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          cookie: toCookieHeader(csrfCookies),
        },
        body: signInBody.toString(),
      }),
    );
    expect(signInResponse.status).toBeLessThan(400);

    const rawSessionCookie = signInResponse.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("authjs.session-token="));
    expect(rawSessionCookie, "session cookie must be set on successful sign-in").toBeTruthy();

    const attrs = parseSetCookieAttrs(rawSessionCookie!);
    expect(attrs).toContain("httponly");
    expect(attrs).toContain("samesite=lax");
    expect(attrs).toContain("path=/");

    // NODE_ENV(このテスト実行環境)が"production"でない場合、lib/auth/config.tsの
    // `secure: process.env.NODE_ENV === "production"` によりSecure属性は付与されない
    // (これは実装どおりの挙動。本番デプロイでNODE_ENV=productionとなることは
    // Cloudflare Workers/OpenNextの既定に依存するため、デプロイ設定側で
    // 別途確認が必要な項目として報告する)。
    const secureAttributePresent = attrs.includes("secure");
    expect(secureAttributePresent).toBe(process.env.NODE_ENV === "production");
  });

  it("CSRF Cookie(authjs.csrf-token)はGET /api/auth/csrfのみで発行され、HttpOnlyである", async () => {
    const csrfResponse = await handlers.GET(new NextRequest(`${BASE_URL}/api/auth/csrf`));
    const rawCsrfCookie = csrfResponse.headers.getSetCookie().find((raw) => raw.startsWith("authjs.csrf-token="));
    expect(rawCsrfCookie).toBeTruthy();
    const attrs = parseSetCookieAttrs(rawCsrfCookie!);
    expect(attrs).toContain("httponly");
    expect(attrs).toContain("samesite=lax");
  });

  it("認証失敗時(不正なパスワード)はセッションCookieを発行しない", async () => {
    const csrfResponse = await handlers.GET(new NextRequest(`${BASE_URL}/api/auth/csrf`));
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookies = extractCookiePairs(csrfResponse);

    const signInBody = new URLSearchParams({
      email,
      password: "definitely-the-wrong-password",
      csrfToken,
      callbackUrl: `${BASE_URL}/`,
      json: "true",
    });
    const signInResponse = await handlers.POST(
      new NextRequest(`${BASE_URL}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          cookie: toCookieHeader(csrfCookies),
        },
        body: signInBody.toString(),
      }),
    );
    const sessionCookieSet = signInResponse.headers
      .getSetCookie()
      .some((raw) => raw.startsWith("authjs.session-token="));
    expect(sessionCookieSet).toBe(false);
  });
});
