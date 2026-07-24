import * as Sentry from "@sentry/browser";

/**
 * ADR-008(docs/design/09) §2(T-505): クライアント側(ブラウザ)は通常のSentry SDK
 * (@sentry/browser)を使う(サーバ側のみtoucan-jsに置き換え、ブラウザは対象外)。
 * NEXT_PUBLIC_SENTRY_DSN未設定時はinit自体を呼ばずno-op(受入基準(4))。
 * ビルド時にクライアントバンドルへ埋め込まれるDSNは送信専用でread権限を持たず、
 * Sentry公式にも公開して問題ない値と説明されている。
 */
export function initClientSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn });
}
