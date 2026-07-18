import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { handlers } from "@/lib/auth/config";
import { POST as signupHandler } from "@/app/api/auth/signup/route";

/**
 * 03文書T-005 受入基準「サインアップ→ログイン→セッション取得のAPI統合テスト」。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration`から実行する。
 *
 * next-auth v5のCSRF保護(ダブルサブミットcookie)に従い、
 * ①signup ②/api/auth/csrf でトークン+cookie取得 ③/api/auth/callback/credentials に
 * 同cookie+トークンを添えてPOST(セッションcookieが発行される)
 * ④/api/auth/session に発行されたcookieを添えてGET、の順で実際のAuth.jsハンドラを呼ぶ。
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

function extractRawSetCookieHeaders(response: Response): string[] {
  return response.headers.getSetCookie();
}

function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

describe("auth flow: signup -> credentials sign-in -> session (T-005)", () => {
  const email = `flow-${randomUUID()}@example.com`;
  const password = "correct horse battery staple";
  const displayName = "Flow Test User";

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates the user via POST /api/auth/signup", async () => {
    const request = new NextRequest(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
    const response = await signupHandler(request);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; email: string };
    expect(body.email).toBe(email);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toBeTruthy();
    expect(stored.passwordHash?.startsWith("$argon2id$")).toBe(true);
  });

  it("rejects a duplicate signup with 409 email_taken", async () => {
    const request = new NextRequest(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
    const response = await signupHandler(request);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("email_taken");
  });

  it("signs in with credentials and issues an HTTPOnly, SameSite=Lax session cookie", async () => {
    const csrfResponse = await handlers.GET(
      new NextRequest(`${BASE_URL}/api/auth/csrf`),
    );
    expect(csrfResponse.status).toBe(200);
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

    const sessionCookieHeader = extractRawSetCookieHeaders(signInResponse).find((raw) =>
      raw.startsWith("authjs.session-token="),
    );
    expect(sessionCookieHeader, "session cookie should be set on successful sign-in").toBeTruthy();
    // 02§1「セッションはHTTPOnly Cookie」/ 03文書T-005「SameSite=Lax」
    expect(sessionCookieHeader!.toLowerCase()).toContain("httponly");
    expect(sessionCookieHeader!.toLowerCase()).toContain("samesite=lax");

    const allCookies = {
      ...csrfCookies,
      ...extractCookiePairs(signInResponse),
    };

    const sessionResponse = await handlers.GET(
      new NextRequest(`${BASE_URL}/api/auth/session`, {
        headers: { cookie: toCookieHeader(allCookies) },
      }),
    );
    expect(sessionResponse.status).toBe(200);
    const session = (await sessionResponse.json()) as {
      user?: { email?: string; id?: string };
    };
    expect(session.user?.email).toBe(email);
    expect(session.user?.id).toBeTruthy();
  });

  it("does not sign in with an incorrect password", async () => {
    const csrfResponse = await handlers.GET(new NextRequest(`${BASE_URL}/api/auth/csrf`));
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookies = extractCookiePairs(csrfResponse);

    const signInBody = new URLSearchParams({
      email,
      password: "wrong-password",
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

    const sessionCookieHeader = extractRawSetCookieHeaders(signInResponse).find((raw) =>
      raw.startsWith("authjs.session-token="),
    );
    expect(sessionCookieHeader).toBeFalsy();
  });
});
