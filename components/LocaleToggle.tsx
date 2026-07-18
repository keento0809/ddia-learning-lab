"use client";

import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/routing";

const OTHER_LOCALE: Record<AppLocale, AppLocale> = { ja: "en", en: "ja" };

/**
 * 02§5.1: 現在ルートを維持したまま他ロケールへ遷移する言語トグル。
 * next-intlのuseRouter().replace(pathname, { locale })がCookie(NEXT_LOCALE)更新
 * (クライアント側同期 + middlewareでのサーバ側同期)まで担うため、追加のCookie
 * 操作は行わない。
 */
export function LocaleToggle({ locale }: { locale: AppLocale }) {
  const pathname = usePathname();
  const router = useRouter();
  const other = OTHER_LOCALE[locale];
  const t = getMessages(locale).nav.localeToggle;

  return (
    <button type="button" aria-label={t.ariaLabel} onClick={() => router.replace(pathname, { locale: other })}>
      {t[other]}
    </button>
  );
}
