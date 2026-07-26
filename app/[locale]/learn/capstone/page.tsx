import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CapstoneScenario } from "@/components/capstone/CapstoneScenario";
import { getCapstoneScenario } from "@/lib/scenario";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

/**
 * キャップストーン(T-302、01基本設計書 §3モジュール12「分岐型シナリオ」)。
 * `/learn/[module]`と同じ深さの静的セグメントとして配置する(Next.js app
 * routerは同一階層で動的セグメントと静的セグメントを共存させられるため、
 * `content/{ja,en}/12-*`のmodule.yaml未整備(T-301未着手)に依存しない)。
 *
 * シナリオ定義は単一(content/scenario-capstone.yaml)で、locale以外の動的
 * セグメントを持たないため、`app/[locale]/page.tsx`(S-01)と同じく
 * `generateStaticParams`でja/enを列挙する。
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
    title: getMessages(locale).capstone.pageTitle,
    alternates: { languages: buildLanguageAlternates("/learn/capstone") },
  };
}

export default async function CapstonePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const scenario = getCapstoneScenario();
  return <CapstoneScenario locale={locale} scenario={scenario} />;
}
