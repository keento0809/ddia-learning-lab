import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { routing, type AppLocale } from "@/lib/i18n/routing";
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
    <html lang={locale}>
      <body>
        {/* UI文言はlib/i18n/messages.tsの自前カタログを使うため、next-intl自体の
            メッセージ機能は使わない。messages={{}}を明示し、next-intl内部の
            「メッセージ未設定」検証エラーを回避する(next-intl/navigationの
            usePathname/useRouterがこのProviderのロケールcontextに依存するため
            Provider自体は必須)。 */}
        <NextIntlClientProvider locale={locale} messages={{}}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
