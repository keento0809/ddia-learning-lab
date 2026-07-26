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
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t.requestTitle}</h1>
      <ResetRequestForm locale={locale} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
          {t.backToSignin}
        </Link>
      </p>
    </main>
  );
}
