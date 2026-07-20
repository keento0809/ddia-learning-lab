import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { redirect } from "@/lib/i18n/navigation";
import { DashboardWithData } from "@/components/dashboard/DashboardWithData";
import { getCurriculumModules } from "@/lib/curriculum";
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
    title: getMessages(locale).dashboard.pageTitle,
    alternates: { languages: buildLanguageAlternates("/dashboard") },
  };
}

/** S-07 ダッシュボード(02§4.4、03文書T-112)。ログイン必須の画面のため未認証時はサインインへ誘導する。 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/auth/signin", locale });
  }
  return (
    <DashboardWithData
      locale={locale}
      curriculumModules={getCurriculumModules(locale)}
      isAuthenticated
    />
  );
}
