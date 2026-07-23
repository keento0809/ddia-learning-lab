import { encode } from "@auth/core/jwt";
import { SESSION_COOKIE_NAME } from "@/workers/api/src/auth";

/**
 * ADR-008(docs/design/09) §2でworker-apiが自己完結でJWTを検証するように
 * なったため(T-502)、API統合テストはlib/auth/config.tsのauth()をモックする
 * 代わりに、実際にAuth.js(lib/auth/config.ts)と同じsecret/salt/cookie名で
 * 署名済みセッションJWTを発行し、本物のCookieとしてリクエストに付与する。
 * (以前はauth()をモックして固定ユーザーのセッションとして扱っていたが、
 * worker-api側はNext.jsのauth()を経由せずCookie内JWTを直接検証するため、
 * モックでは経路をカバーできなくなった。)
 */
export async function issueSessionCookie(userId: string): Promise<string> {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET is not set (scripts/test-integration.shから実行してください)");
  }
  const token = await encode({
    token: { uid: userId },
    secret: authSecret,
    salt: SESSION_COOKIE_NAME,
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}
