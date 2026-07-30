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
 *
 * T-108r: 本番ルート(`/learn/[module]/lab/[exercise]`)新設後も開発専用ルート
 * として残す(content/には現時点でSQL演習YAMLが1件も存在しないため、SQLモードの
 * 実挙動を検証できる唯一の経路。Playwright/verify-webappの固定検証先として
 * 引き続き使用する)。ヘッダーナビからはリンクしておらず、検索インデックスにも
 * 含めないよう`robots: noindex`を明示する。
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
    robots: { index: false, follow: false },
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
