import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { QuizAccessNotice } from "@/components/quiz/QuizAccessNotice";
import { getModuleDetail } from "@/lib/moduleDetail";
import { getQuiz } from "@/lib/quiz";
import { getModuleAccessTier, isModuleFullyVisibleUnauthenticated } from "@/lib/moduleAccess";
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

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  /**
   * T-604(ADR-009 §5層1・§6)。Gated階層かつ未認証の場合はquiz.yaml
   * (正解id・解説を含む)を読み込みすらしない。RSCペイロード/HTMLに
   * クイズ本体が一切含まれないことがこのタスクの受入基準
   * (未認証時にQuizRunnerがツリーに含まれないことを証明するテスト、
   * tests/unit/quiz/accessGate.test.ts参照)。ソフトウォールUIはT-603の
   * スコープ、ここではQuizAccessNotice(最小プレースホルダ)で代替する。
   */
  const tier = getModuleAccessTier(detail.meta.order);
  if (!isAuthenticated && !isModuleFullyVisibleUnauthenticated(tier)) {
    return <QuizAccessNotice locale={locale} />;
  }

  const quiz = getQuiz(locale, moduleSlug);
  if (!quiz) {
    notFound();
  }

  return (
    <QuizRunner
      locale={locale}
      moduleSlug={moduleSlug}
      moduleTitle={detail.meta.title}
      quiz={quiz}
      isAuthenticated={isAuthenticated}
    />
  );
}
