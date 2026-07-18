import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CurriculumList } from "@/components/curriculum/CurriculumList";
import { getCurriculumModules } from "@/lib/curriculum";
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
    title: getMessages(locale).curriculum.pageTitle,
    alternates: { languages: buildLanguageAlternates("/learn") },
  };
}

export default async function LearnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return <CurriculumList locale={locale} modules={getCurriculumModules(locale)} />;
}
