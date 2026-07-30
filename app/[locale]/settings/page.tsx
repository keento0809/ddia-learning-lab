import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { redirect } from "@/lib/i18n/navigation";
import { SettingsWithData } from "@/components/settings/SettingsWithData";
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
    title: getMessages(locale).settings.pageTitle,
    alternates: { languages: buildLanguageAlternates("/settings") },
  };
}

/** S-10設定画面(01§7.1、T-308)。ログイン必須のためセッションが無ければサインインへ誘導する。 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/auth/signin", locale });
  }
  return <SettingsWithData locale={locale} />;
}
