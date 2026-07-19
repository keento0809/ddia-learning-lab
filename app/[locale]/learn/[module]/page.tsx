import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModuleDetailWithProgress } from "@/components/module/ModuleDetailWithProgress";
import { getModuleDetail } from "@/lib/moduleDetail";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";
import { auth } from "@/lib/auth/config";

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
  const session = await auth();
  return (
    <ModuleDetailWithProgress
      locale={locale}
      detail={detail}
      isAuthenticated={Boolean(session?.user?.id)}
    />
  );
}
