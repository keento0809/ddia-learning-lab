import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { buildThemeBootstrapScript } from "@/lib/store/themeBootstrapScript";
import { AppQueryProvider } from "@/lib/query/AppQueryProvider";
import { GuestProgressImportGate } from "@/components/progress/GuestProgressImportGate";
import { auth } from "@/lib/auth/config";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);
  // OAuth(Google/GitHub)ユーザーはAuth.js側で既にsession.user.imageに
  // profile.picture/avatar_urlが入る(next-auth既定のjwt/session処理、
  // @auth/core/providers/github.js・providers.js参照。Credentialsユーザーは
  // authorize()がimageを返さないためundefinedのまま)。lib/contracts/や
  // next-authのSession型に変更は不要(DefaultUserが元からid/name/image任意)。
  const avatarUrl = session?.user?.image ?? null;
  const displayName = session?.user?.name ?? null;

  return (
    // テーマ切替のbeforeInteractiveスクリプトがハイドレーション前に<html>へ
    // darkクラスを注入するため、Reactの属性不一致警告(実害のないハイドレーション
    // 警告)をここで明示的に抑制する(qa-evaluatorで検出: ダーク選択後のリロード時
    // に毎回警告が出ていた)。
    <html lang={locale} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* テーマ切替(02§6)のFOUC防止: ハイドレーション前に<html>へdarkクラスを
            適用する。beforeInteractiveはルートレイアウトでのみ使用可能。 */}
        <Script id="theme-init" strategy="beforeInteractive">
          {buildThemeBootstrapScript()}
        </Script>
        {/* UI文言はlib/i18n/messages.tsの自前カタログを使うため、next-intl自体の
            メッセージ機能は使わない。messages={{}}を明示し、next-intl内部の
            「メッセージ未設定」検証エラーを回避する(next-intl/navigationの
            usePathname/useRouterがこのProviderのロケールcontextに依存するため
            Provider自体は必須)。 */}
        <NextIntlClientProvider locale={locale} messages={{}}>
          <Header
            locale={locale}
            isAuthenticated={isAuthenticated}
            avatarUrl={avatarUrl}
            displayName={displayName}
          />
          <AppQueryProvider>
            <GuestProgressImportGate isAuthenticated={isAuthenticated} />
            <div className="flex-1">{children}</div>
          </AppQueryProvider>
          <Footer locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
