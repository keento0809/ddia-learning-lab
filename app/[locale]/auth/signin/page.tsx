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
    <main style={{ maxWidth: "420px", margin: "0 auto", padding: "1rem" }}>
      <h1>{t.title}</h1>
      <SignInForm locale={locale} />
      {/* T-007/T-101/T-112が未実装で遷移先のホーム画面がまだ存在しないため、
          現時点で実在する/demo(Walking Skeleton)を暫定の遷移先とする。 */}
      <OAuthButtons
        locale={locale}
        providers={getEnabledOAuthProviders()}
        callbackUrl={`/${locale}/demo`}
      />
      <p>
        <Link href="/auth/reset">{t.resetLink}</Link>
      </p>
      <p>
        {t.signupPrompt}
        {" "}
        <Link href="/auth/signup">{t.signupLink}</Link>
      </p>
    </main>
  );
}
