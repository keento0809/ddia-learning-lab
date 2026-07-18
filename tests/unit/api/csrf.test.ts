import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  verifyCsrfToken,
} from "@/lib/api/csrf";

function requestWith(cookie: string | undefined, header: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${CSRF_COOKIE_NAME}=${cookie}`;
  if (header !== undefined) headers[CSRF_HEADER_NAME] = header;
  return new NextRequest("http://localhost:3000/api/progress", { headers });
}

/** 03文書T-104「CSRF」ダブルサブミットcookie検証の単体テスト */
describe("csrf", () => {
  it("generateCsrfToken は毎回異なるトークンを生成する", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(16);
  });

  it("cookieとヘッダが一致すればtrue", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(requestWith(token, token))).toBe(true);
  });

  it("cookieとヘッダが不一致ならfalse", () => {
    expect(verifyCsrfToken(requestWith(generateCsrfToken(), generateCsrfToken()))).toBe(false);
  });

  it("cookieが無ければfalse", () => {
    expect(verifyCsrfToken(requestWith(undefined, generateCsrfToken()))).toBe(false);
  });

  it("ヘッダが無ければfalse", () => {
    expect(verifyCsrfToken(requestWith(generateCsrfToken(), undefined))).toBe(false);
  });
});
