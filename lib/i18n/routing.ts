import { defineRouting } from "next-intl/routing";

/**
 * 02§5.1: 言語解決優先順位 URL > Cookie(NEXT_LOCALE) > Accept-Language > 既定 'en'。
 * next-intlのデフォルト実装(localeDetection: true, localeCookie name: NEXT_LOCALE)が
 * この優先順位そのものであるため、追加のカスタム解決ロジックは持たない。
 */
export const routing = defineRouting({
  locales: ["ja", "en"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
