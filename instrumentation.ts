import type { Instrumentation } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { captureWorkerError } from "@/lib/sentry/toucan";

/**
 * Next.js規約ファイル。ADR-008(docs/design/09) §2・§4(T-505): worker-app側の
 * サーバエラー捕捉入口。@opennextjs/cloudflareのgetCloudflareContext()経由で
 * Workerのbindings(SENTRY_DSN)とExecutionContext(waitUntil、レスポンス確定後の
 * 非同期送信を保証するために必須)を取得し、共通のtoucan-jsラッパー
 * (lib/sentry/toucan.ts)へ委譲する。
 *
 * onRequestErrorはRequestオブジェクトを渡さず{path, method, headers}のみを
 * 提供する規約のため、Cookie(セッションJWT)を含むheadersはそのまま転送せず、
 * 02§10ログ方針(PIIマスク)に沿ってpath/methodのみをタグとして送る。
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  errorRequest,
  errorContext,
) => {
  const { env, ctx } = await getCloudflareContext({ async: true });
  captureWorkerError(error, {
    dsn: env.SENTRY_DSN,
    waitUntil: ctx.waitUntil.bind(ctx),
    tags: {
      path: errorRequest.path,
      method: errorRequest.method,
      routerKind: errorContext.routerKind,
      routeType: errorContext.routeType,
    },
  });
};
