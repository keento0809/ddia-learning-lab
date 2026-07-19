import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { getModuleDetail } from "@/lib/moduleDetail";
import { getQuiz } from "@/lib/quiz";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

/**
 * S-05 クイズ(02文書ディレクトリ構成「quiz/page.tsx # S-05 クイズ」、03文書T-106)。
 * `generateStaticParams`は持たない(T-103決定事項ログ「失敗→恒久対策(2)」:
 * 静的シェル化するとworkerd上で未列挙パラメータへのnotFound()がDYNAMIC_SERVER_USAGE
 * エラーになるため、T-101/T-102と同じく常時動的レンダリングとする)。
 */
function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}): Promise<Metadata> {
  const { locale, module: moduleSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail || !detail.hasQuiz) {
    notFound();
  }
  return {
    title: detail.meta.title,
    alternates: { languages: buildLanguageAlternates(`/learn/${moduleSlug}/quiz`) },
  };
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}) {
  const { locale, module: moduleSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail || !detail.hasQuiz) {
    notFound();
  }
  const quiz = getQuiz(locale, moduleSlug);
  if (!quiz) {
    notFound();
  }

  const session = await auth();

  return (
    <QuizRunner
      locale={locale}
      moduleSlug={moduleSlug}
      moduleTitle={detail.meta.title}
      quiz={quiz}
      isAuthenticated={Boolean(session?.user?.id)}
    />
  );
}
