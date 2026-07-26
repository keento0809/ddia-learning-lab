import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Link } from "@/lib/i18n/navigation";
import { getEnabledOAuthProviders } from "@/lib/auth/providers";
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
    title: getMessages(locale).auth.signup.title,
    alternates: { languages: buildLanguageAlternates("/auth/signup") },
  };
}

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const t = getMessages(locale).auth.signup;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <SignUpForm locale={locale} />
      {/* T-007/T-101/T-112が未実装で遷移先のホーム画面がまだ存在しないため、
          現時点で実在する/demo(Walking Skeleton)を暫定の遷移先とする。 */}
      <OAuthButtons
        locale={locale}
        providers={getEnabledOAuthProviders()}
        callbackUrl={`/${locale}/demo`}
      />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {t.signinPrompt}
        {" "}
        <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
          {t.signinLink}
        </Link>
      </p>
    </main>
  );
}
