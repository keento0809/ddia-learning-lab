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
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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
          <Header locale={locale} />
          <AppQueryProvider>
            <div className="flex-1">{children}</div>
          </AppQueryProvider>
          <Footer locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
