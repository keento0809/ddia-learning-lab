import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModuleDetail } from "@/components/module/ModuleDetail";
import { getModuleDetail } from "@/lib/moduleDetail";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}): Promise<Metadata> {
  const { locale, module: moduleSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  return {
    title: detail.meta.title,
    alternates: { languages: buildLanguageAlternates(`/learn/${moduleSlug}`) },
  };
}

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}) {
  const { locale, module: moduleSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  return <ModuleDetail locale={locale} detail={detail} />;
}
