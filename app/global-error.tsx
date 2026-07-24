"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/browser";
import { getMessages } from "@/lib/i18n/messages";
import { routing } from "@/lib/i18n/routing";
import "./globals.css";

/**
 * ルートレイアウト(app/[locale]/layout.tsx)自体で例外が発生した場合の
 * 最終防波堤。Next.js規約上、独自の<html><body>を持つ必要があり、
 * ロケール文脈(NextIntlClientProvider含む)が使えないため既定ロケール(en)
 * のメッセージカタログを直接参照する(rule5対応。直書き文字列は使わない)。
 * app/[locale]/layout.tsxを経由しないルートのためglobals.cssを直接importする。
 * T-505(ADR-008 §2): Sentry(@sentry/browser)へcaptureException(no DSN時no-op)。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getMessages(routing.defaultLocale).error;

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={routing.defaultLocale}>
      <body>
        <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-neutral-600">{t.description}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
            >
              {t.retryLabel}
            </button>
            <a
              href={`/${routing.defaultLocale}`}
              className="rounded border border-neutral-300 px-4 py-2 hover:bg-neutral-100"
            >
              {t.homeLinkLabel}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
