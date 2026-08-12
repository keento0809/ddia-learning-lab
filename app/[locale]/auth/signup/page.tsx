import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { auth } from "@/lib/auth/config";
import { Link, redirect } from "@/lib/i18n/navigation";
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
  // dashboard/page.tsx(未認証→signinへ誘導)の逆方向: ログイン済みでの直接アクセスは
  // 既にアカウントがあるためサインアップの意味がなく、ダッシュボードへ誘導する。
  const session = await auth();
  if (session?.user?.id) {
    redirect({ href: "/dashboard", locale });
  }
  const t = getMessages(locale).auth.signup;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <SignUpForm locale={locale} />
      {/* T-112でダッシュボードが実装済みのため、サインアップ完了後はS-07
          (01§7.1)へ遷移する。 */}
      <OAuthButtons
        locale={locale}
        providers={getEnabledOAuthProviders()}
        callbackUrl={`/${locale}/dashboard`}
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
