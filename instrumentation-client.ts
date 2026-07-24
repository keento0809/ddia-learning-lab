import { initClientSentry } from "@/lib/sentry/client";

/**
 * Next.js規約ファイル(ハイドレーション前に実行)。T-505: ブラウザ側Sentry初期化の
 * 唯一の入口。詳細はlib/sentry/client.ts参照。
 */
initClientSentry(process.env.NEXT_PUBLIC_SENTRY_DSN);
