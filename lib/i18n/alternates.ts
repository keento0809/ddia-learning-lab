import { routing } from "@/lib/i18n/routing";

/**
 * 02§5.1「全ページに<link rel="alternate" hreflang>を出力」に対応するヘルパ。
 * pathname はロケールプレフィックスを含まないルート内相対パス(例: "/demo")。
 */
export function buildLanguageAlternates(pathname: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `/${locale}${pathname}`;
  }
  languages["x-default"] = `/${routing.defaultLocale}${pathname}`;
  return languages;
}
