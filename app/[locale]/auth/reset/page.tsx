import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResetRequestForm } from "@/components/auth/ResetRequestForm";
import { Link } from "@/lib/i18n/navigation";
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
    title: getMessages(locale).auth.reset.requestTitle,
    alternates: { languages: buildLanguageAlternates("/auth/reset") },
  };
}

export default async function ResetRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const t = getMessages(locale).auth.reset;

  return (
    <main style={{ maxWidth: "420px", margin: "0 auto", padding: "1rem" }}>
      <h1>{t.requestTitle}</h1>
      <ResetRequestForm locale={locale} />
      <p>
        <Link href="/auth/signin">{t.backToSignin}</Link>
      </p>
    </main>
  );
}
