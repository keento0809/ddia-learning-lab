import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchPage } from "@/components/search/SearchPage";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return {
    title: getMessages(locale).search.pageTitle,
    alternates: { languages: buildLanguageAlternates("/search") },
  };
}

/** S-09 検索結果画面(`/ja/search?q=`、01基本設計書の画面一覧)。ログイン不要。 */
export default async function LocaleSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const { q } = await searchParams;

  return <SearchPage locale={locale} initialQuery={q ?? ""} />;
}
