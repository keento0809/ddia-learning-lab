"use client";

import { useParams } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

/**
 * not-foundファイルはNext.jsの規約上paramsを受け取らないため、useParams()で
 * 現在ロケールを取得する(next-intl公式パターン)。app/[locale]/layout.tsx配下で
 * 描画されるためHeader/Footerはlayoutが提供し、ここではmain部のみを返す。
 */
export default function LocaleNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale: AppLocale = isAppLocale(params?.locale) ? params.locale : routing.defaultLocale;
  const t = getMessages(locale).notFound;

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{t.description}</p>
      <Link
        href="/"
        prefetch={false}
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {t.homeLinkLabel}
      </Link>
    </main>
  );
}
