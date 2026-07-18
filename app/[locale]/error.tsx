"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

/**
 * 02§10 Error Boundary方針: レンダリングエラー発生時もページ全体を落とさず、
 * 復旧導線(再試行/ホームへ)を提示する。error.tsxはNext.jsの規約上params
 * を受け取らないためnot-found.tsxと同様にuseParams()でロケールを解決する。
 * Sentry等の外部ログ送信はT-007の対象外(未導入、ADR未決)のためconsole.error
 * のみ行う。
 */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale: AppLocale = isAppLocale(params?.locale) ? params.locale : routing.defaultLocale;
  const t = getMessages(locale).error;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{t.description}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {t.retryLabel}
        </button>
        <Link
          href="/"
          prefetch={false}
          className="rounded border border-neutral-300 px-4 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {t.homeLinkLabel}
        </Link>
      </div>
    </main>
  );
}
