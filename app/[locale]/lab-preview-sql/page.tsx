import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { getDemoSqlExercise } from "@/lib/lab/demoSqlExercise";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

/**
 * S-06 SQL演習ページ(T-202)の検証・デモ用の固定ルート。
 * `/[locale]/lab-preview`(T-108、JS版)と対をなす。`lib/lab/demoSqlExercise.ts`
 * のドキュメント参照: content/への実演習データ投入前でもSQLモードの受入基準
 * (Monaco言語切替/スキーマビューア/Playwright)を安定して検証するために新設した。
 */
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
    title: getMessages(locale).labPreviewSql.pageTitle,
    alternates: { languages: buildLanguageAlternates("/lab-preview-sql") },
  };
}

export default async function LabPreviewSqlPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return <LabWorkspace exercise={getDemoSqlExercise(locale)} locale={locale} />;
}
