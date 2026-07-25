import { Toucan } from "toucan-js";

export interface WorkerErrorContext {
  dsn: string | undefined;
  request?: Request;
  waitUntil?: (promise: Promise<unknown>) => void;
  userId?: string;
  tags?: Record<string, string>;
}

/**
 * ADR-008(docs/design/09) §2・§4(T-505): worker-app/worker-api共通のtoucan-js
 * ラッパー。SENTRY_DSN未設定時はno-op(受入基準(4))。
 *
 * 02§10ログ方針(PIIマスク・提出コード非閲覧)は、requestDataOptionsを指定しない
 * toucan-jsの既定動作にそのまま依拠して満たす: Cookieヘッダ(セッションJWTを含む)
 * とURLクエリ文字列は allowedCookies/allowedSearchParams を明示指定しない限り
 * 送信前にイベントから削除される(node_modules/toucan-js dist実装で確認済み)。
 * リクエストボディ(演習提出コードを含み得る)は setRequestBody() を呼ばない限り
 * 一切収集されないため、ここでも呼び出さない。
 */
export function captureWorkerError(
  error: unknown,
  ctx: WorkerErrorContext,
): void {
  if (!ctx.dsn) return;

  const sentry = new Toucan({
    dsn: ctx.dsn,
    request: ctx.request,
    context: ctx.waitUntil ? { waitUntil: ctx.waitUntil } : undefined,
  });
  if (ctx.userId) sentry.setUser({ id: ctx.userId });
  if (ctx.tags) {
    for (const [key, value] of Object.entries(ctx.tags)) {
      sentry.setTag(key, value);
    }
  }
  sentry.captureException(error);
}
