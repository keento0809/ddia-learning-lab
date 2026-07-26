import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResetConfirmForm } from "@/components/auth/ResetConfirmForm";
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
    title: getMessages(locale).auth.reset.confirmTitle,
    alternates: { languages: buildLanguageAlternates("/auth/reset/confirm") },
  };
}

export default async function ResetConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const { token } = await searchParams;
  const t = getMessages(locale).auth.reset;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t.confirmTitle}</h1>
      <ResetConfirmForm locale={locale} token={token ?? null} />
    </main>
  );
}
