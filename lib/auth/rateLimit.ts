/**
 * 02§3共通仕様「レート制限: 認証系 5req/min/IP」のミドルウェア実装。
 *
 * インメモリのスライディングウィンドウ(モジュールスコープのMap)で実装する。
 * Cloudflare Workers(ADR-007)はisolateごとにメモリが分離されるため、複数
 * isolate/エッジロケールをまたいだ厳密な集計は保証されない(KV/Durable
 * Objects未導入の現段階での既知の制約。docs/tasks/STATUS.md決定事項ログ参照)。
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
