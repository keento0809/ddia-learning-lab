import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Viz } from "@/components/mdx/Viz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";

/**
 * RaftViz(T-207, 02§8.2)の検証・デモ用の固定ルート。本番カリキュラム導線
 * (`/learn/[module]/[lesson]`)には一切リンクされない検証専用ページであり、
 * `components/layout/Header.tsx`のナビゲーションにも追加しない。
 * content/への実教材投入(T-210/T-211、`<Viz name="raft">`をMDXから参照する
 * レッスン本文)は本タスクのスコープ外(依存未充足、CLAUDE.md規則10)のため、
 * `<Viz name="raft">`経由の遅延ロード・実操作をcontent/に依存せず検証できる
 * よう、T-108の`/lab-preview`(lib/lab/demoExercise.tsのドキュメント参照)と
 * 同じ設計判断を踏襲した固定プレビュールートを新設する。
 * 検証専用ページが検索エンジンにインデックスされないよう`robots: noindex,
 * nofollow`を明示する(本番導線でないページはクロール対象から除外する方針)。
 */
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
    title: getMessages(locale).vizPreview.raftPageTitle,
    alternates: { languages: buildLanguageAlternates("/viz-preview/raft") },
    robots: { index: false, follow: false },
  };
}

export default async function RaftVizPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return (
    <LessonLocaleProvider locale={locale}>
      <main className="mx-auto max-w-3xl p-6">
        <Viz name="raft" />
      </main>
    </LessonLocaleProvider>
  );
}
