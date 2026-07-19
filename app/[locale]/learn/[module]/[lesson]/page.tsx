import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonLayout } from "@/components/lesson/LessonLayout";
import { getModuleDetail } from "@/lib/moduleDetail";
import { buildLessonPageData } from "@/lib/lessonPage";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

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
 * content/{locale}/{module}/{lesson}.mdxをビルド時に解決する(@next/mdxの
 * webpackローダによるcontext module化。lib/content.tsの`node:fs`直接importを
 * 避ける既存パターン(T-101/T-102決定事項ログ)と同じ理由: Cloudflare Workers
 * のリクエスト処理経路にfs読み込みを持ち込まないため)。該当ファイルが存在しない
 * 場合はnotFound()。
 */
async function loadLessonContent(
  locale: string,
  moduleSlug: string,
  lessonId: string,
): Promise<ComponentType> {
  try {
    const mod: { default: ComponentType } = await import(
      `@/content/${locale}/${moduleSlug}/${lessonId}.mdx`
    );
    return mod.default;
  } catch {
    notFound();
  }
}

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

  const Content = await loadLessonContent(locale, moduleSlug, lessonId);

  return (
    <LessonLayout
      locale={locale}
      moduleSlug={data.moduleSlug}
      moduleTitle={data.moduleTitle}
      lessonTitle={data.lessonTitle}
      minutes={data.minutes}
      toc={data.toc}
      currentKey={data.currentKey}
      prevHref={data.prevHref}
      nextHref={data.nextHref}
    >
      <Content />
    </LessonLayout>
  );
}
