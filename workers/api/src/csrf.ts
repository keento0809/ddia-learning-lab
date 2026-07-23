import { timingSafeEqual } from "node:crypto";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, generateCsrfToken } from "../../../lib/api/csrf";

/**
 * lib/api/csrf.ts の検証ロジックのHono版。lib/api/csrf.tsのverifyCsrfTokenは
 * NextRequest専用のため、worker-api(Honoの標準Request)向けに同じダブルサブミット
 * cookie方式を再実装する(定数・トークン生成は共有元をそのままimportして重複を避ける)。
 */
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, generateCsrfToken };

export function verifyCsrfToken(c: Context): boolean {
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);
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
