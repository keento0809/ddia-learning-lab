import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchPage } from "@/components/search/SearchPage";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

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

/**
 * S-09 検索結果画面(`/ja/search?q=`、01基本設計書の画面一覧)。ページ自体は
 * ログイン不要(ADR-009 §3.1 Public)。
 *
 * T-705(docs/security/findings.md High #2)。以前はauth()結果に応じて
 * Gated階層のレッスン本文を含む「認証済み向け」検索インデックスを`SearchPage`
 * (Client Component)へ選択させていたが、検索インデックスは静的アセットとして
 * ビルドされ認証状態に関わらず誰でも直接fetchできるため、この分岐自体が
 * 本文漏洩の経路になっていた。配信する検索インデックスは常に1種類
 * (Gated階層の本文を含まない)であり、このページはauth()を呼ばない。
 */
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
