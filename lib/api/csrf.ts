import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * 02§3共通仕様「状態変更系はCSRFトークン必須」(01§CSRF: SameSite=Lax Cookie +
 * CSRFトークン)。ダブルサブミットcookie方式: 安全メソッド(GET)応答でcookieを
 * 発行し、状態変更系リクエストはそのcookie値をヘッダに複製して送る。
 * サーバはcookie値とヘッダ値の一致を検証する(値自体はセッションに紐付かない
 * 単純トークンで、盗聴されない限り第三者サイトはcookieを読めずヘッダを複製できない)。
 */
export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken) {
    return false;
  }
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);
  if (cookieBuf.length !== headerBuf.length) {
    return false;
  }
  return timingSafeEqual(cookieBuf, headerBuf);
}
