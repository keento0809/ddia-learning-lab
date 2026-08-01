import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonLayout } from "@/components/lesson/LessonLayout";
import { LessonAccessNotice } from "@/components/lesson/LessonAccessNotice";
import { getModuleDetail } from "@/lib/moduleDetail";
import { buildLessonPageData } from "@/lib/lessonPage";
import { loadLessonContent } from "@/lib/lessonContentLoader";
import { resolveLessonAccessTier, getLessonPreviewHtml } from "@/lib/lessonAccess";
import { isLessonFullyVisibleUnauthenticated, isLessonPreviewOnlyUnauthenticated } from "@/lib/contracts/access";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";
import { auth } from "@/lib/auth/config";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * 失敗→恒久対策: 当初`generateStaticParams`で全レッスンを列挙しSSGしていたが、
 * `wrangler dev`実アクセス確認(T-101決定事項ログの「fs依存を組み込んだ変更は
 * wrangler devで確認する」を本ルートのnotFound()経路にも適用)で、未列挙の
 * module/lessonにアクセスすると`DYNAMIC_SERVER_USAGE`により500になることを
 * 発見した(`generateStaticParams`が存在するとNextがこのルートを静的シェルとして
 * 扱い、フォールバック時のnotFound()呼び出しがworkerdランタイム上で静的生成と
 * 衝突するため)。T-102の`/learn/[module]`(generateStaticParamsを持たず常に
 * 動的レンダリング)がこの問題を起こさないことを確認し、同じ設計(SSGにせず
 * 常時動的レンダリング)に合わせた。content/にレッスンが投入され次第SSG化を
 * 検討する場合は、このnotFound()衝突を再度wrangler devで確認すること。
 *
 * MDX本文の解決自体はlib/lessonContentLoader.tsへ委譲する(T-602で切り出し、
 * 同ファイルのコメント参照)。
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string; lesson: string }>;
}): Promise<Metadata> {
  const { locale, module: moduleSlug, lesson: lessonId } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  const data = buildLessonPageData(moduleSlug, lessonId, detail);
  if (!data) {
    notFound();
  }
  return {
    title: `${data.lessonTitle} | ${data.moduleTitle}`,
    alternates: { languages: buildLanguageAlternates(`/learn/${moduleSlug}/${lessonId}`) },
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; module: string; lesson: string }>;
}) {
  const { locale, module: moduleSlug, lesson: lessonId } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  const data = buildLessonPageData(moduleSlug, lessonId, detail);
  if (!data) {
    notFound();
  }

  const tier = resolveLessonAccessTier(locale, moduleSlug, lessonId);
  if (!tier) {
    notFound();
  }

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  /**
   * T-602(ADR-009 §5 層1)。gated/previewかつ未認証の場合はMDX本文を
   * importすらしない(loadLessonContentを呼ばない)。RSCペイロード/HTMLに
   * 本文が一切含まれないことがこのタスクの受入基準(未認証時に本文コンポーネント
   * がツリーに含まれないことを証明するテスト、tests/unit/lesson/accessGate.test.ts
   * 参照)。ソフトウォールの装飾UI(フェードアウト・CTA群)はT-603のスコープ、
   * ここではLessonAccessNotice(最小プレースホルダ)で代替する。
   */
  let lessonBody: ReactNode;
  if (isAuthenticated || isLessonFullyVisibleUnauthenticated(tier)) {
    const Content = await loadLessonContent(locale, moduleSlug, lessonId);
    lessonBody = <Content />;
  } else if (isLessonPreviewOnlyUnauthenticated(tier)) {
    lessonBody = (
      <LessonAccessNotice locale={locale} previewHtml={getLessonPreviewHtml(locale, moduleSlug, lessonId)} />
    );
  } else {
    lessonBody = <LessonAccessNotice locale={locale} />;
  }

  return (
    <LessonLayout
      locale={locale}
      moduleSlug={data.moduleSlug}
      lessonId={data.lessonId}
      moduleTitle={data.moduleTitle}
      lessonTitle={data.lessonTitle}
      minutes={data.minutes}
      toc={data.toc}
      currentKey={data.currentKey}
      prevHref={data.prevHref}
      nextHref={data.nextHref}
      isAuthenticated={isAuthenticated}
    >
      {lessonBody}
    </LessonLayout>
  );
}
