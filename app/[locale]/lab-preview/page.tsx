import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { getDemoExercise } from "@/lib/lab/demoExercise";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

/**
 * S-06 演習ページ(T-108)の検証・デモ用の固定ルート。
 * `lib/lab/demoExercise.ts`のドキュメント参照: content/への実演習データ投入
 * (T-110/T-111)前でも、S-06自体の受入基準(Playwright/qa-evaluator/
 * verify-webapp)を安定して検証するために新設した(content/には一切依存しない、
 * T-000の`/demo`ルートと同じ設計上の位置づけ)。
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
    title: getMessages(locale).labPreview.pageTitle,
    alternates: { languages: buildLanguageAlternates("/lab-preview") },
  };
}

export default async function LabPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return <LabWorkspace exercise={getDemoExercise(locale)} locale={locale} />;
}
