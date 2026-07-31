import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { VizPersistenceScopeProvider } from "@/lib/lesson/vizPersistenceContext";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";
import JaVizPreviewContent from "@/content/ja/viz-preview.mdx";
import EnVizPreviewContent from "@/content/en/viz-preview.mdx";

/**
 * IsolationViz(T-208, 02§8.2)を、Ch7の教材投入(T-210以降)前でも
 * `<Viz>`経由の実MDX遅延ロード経路(components/mdx/Viz.tsx)で検証するための
 * 固定ルート。`/lab-preview`(T-108, S-06のcontent非依存デモ用ルート)と
 * 同じ設計上の位置づけで、content/への実カリキュラム投入を待たずに
 * 受入基準(verify-webappスキル)を安定して検証するために新設した。
 */

const CONTENT: Record<AppLocale, ComponentType> = {
  ja: JaVizPreviewContent,
  en: EnVizPreviewContent,
};

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
    title: getMessages(locale).vizPreview.pageTitle,
    alternates: { languages: buildLanguageAlternates("/viz-preview") },
  };
}

export default async function VizPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const Content = CONTENT[locale];

  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "1rem" }}>
      <article>
        <LessonLocaleProvider locale={locale}>
          {/* 02§5.1: 言語トグルは同一ルートへのクライアント側遷移だが、CONTENT[locale]が
              ロケールごとに別々のコンパイル済みMDXコンポーネントを描画するため、Reactは
              このサブツリーをアンマウント→再マウントする。VizPersistenceScopeProviderで
              ロケール非依存の固定スコープキーを渡し、Viz側(IsolationViz.tsx)の
              モジュールスコープキャッシュで状態を復元する(詳細はlib/lesson/vizPersistenceContext.tsx参照)。 */}
          <VizPersistenceScopeProvider scope="viz-preview">
            <Content />
          </VizPersistenceScopeProvider>
        </LessonLocaleProvider>
      </article>
    </main>
  );
}
