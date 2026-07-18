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
    <main style={{ maxWidth: "420px", margin: "0 auto", padding: "1rem" }}>
      <h1>{t.confirmTitle}</h1>
      <ResetConfirmForm locale={locale} token={token ?? null} />
    </main>
  );
}
