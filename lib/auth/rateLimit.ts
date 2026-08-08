import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * 02§3共通仕様「レート制限: 認証系 5req/min/IP」のミドルウェア実装。
 *
 * `isRateLimited`はインメモリのスライディングウィンドウ(モジュールスコープの
 * Map)で実装する。Cloudflare Workers(ADR-007)はisolateごとにメモリが
 * 分離されるため、複数isolate/エッジロケールをまたいだ厳密な集計は保証
 * されない(T-703 AU-8所見、docs/security/findings.md Medium #4)。
 *
 * T-705修正: 実際のCloudflare Workersランタイム上ではwrangler.jsoncの
 * Rate Limiting APIバインディング(`AUTH_RATE_LIMITER`、エッジ側で状態を
 * 共有しisolate分離の影響を受けない)を優先して使う`isAuthRateLimited`を
 * 呼び出し側(middleware.ts)の入口とする。このバインディングに到達できない
 * 実行環境(next dev単体・vitestのNode環境等、getCloudflareContext()が
 * 例外を投げる)では、既存のisolate単位フォールバック(`isRateLimited`)へ
 * 委譲する(lib/auth/workerApiAuth.tsの各forwarderと同じフォールバック方針)。
 */

const WINDOW_MS = 60_000;
const LIMIT = 5;

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= LIMIT) {
    requestLog.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return false;
}

export function resetRateLimit(): void {
  requestLog.clear();
}

export async function isAuthRateLimited(key: string): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const { success } = await env.AUTH_RATE_LIMITER.limit({ key });
    return !success;
  } catch {
    return isRateLimited(key);
  }
}

export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "unknown";
}
