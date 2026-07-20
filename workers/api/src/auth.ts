import { decode } from "@auth/core/jwt";

/**
 * Auth.js(lib/auth/config.ts)が発行するセッションCookieの名前。
 * cookies.sessionToken.name を明示指定しているため環境によらず固定。
 */
export const SESSION_COOKIE_NAME = "authjs.session-token";

export interface VerifiedSession {
  userId: string;
}

function extractCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Cookieヘッダ内のAuth.jsセッションJWT(JWE)を検証する。
 * decode()のsaltはAuth.js既定どおりCookie名そのもの(@auth/core/jwt getToken実装に準拠)。
 */
export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string,
): Promise<VerifiedSession | null> {
  const token = extractCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) return null;

  try {
    const payload = await decode({ token, secret, salt: SESSION_COOKIE_NAME });
    if (!payload || typeof payload.uid !== "string") {
      return null;
    }
    return { userId: payload.uid };
  } catch {
    return null;
  }
}
