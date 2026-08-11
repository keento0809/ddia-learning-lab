import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
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
    title: getMessages(locale).auth.signin.title,
    alternates: { languages: buildLanguageAlternates("/auth/signin") },
  };
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const t = getMessages(locale).auth.signin;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <SignInForm locale={locale} />
      {/* T-112でダッシュボードが実装済みのため、サインイン完了後はS-07
          (01§7.2)へ遷移する。 */}
      <OAuthButtons
        locale={locale}
        providers={getEnabledOAuthProviders()}
        callbackUrl={`/${locale}/dashboard`}
      />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/reset" className="underline underline-offset-2 hover:no-underline">
          {t.resetLink}
        </Link>
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {t.signupPrompt}
        {" "}
        <Link href="/auth/signup" className="underline underline-offset-2 hover:no-underline">
          {t.signupLink}
        </Link>
      </p>
    </main>
  );
}
