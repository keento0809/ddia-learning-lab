import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { getModuleDetail } from "@/lib/moduleDetail";
import { buildLabPageData } from "@/lib/labPage";
import { getMessages, formatMessage } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";
import { auth } from "@/lib/auth/config";

/**
 * S-06 演習ページ本番ルート(T-108r, 01基本設計書 ディレクトリ構成
 * `lab/[exercise]/page.tsx`、02§1・§4.2)。content YAML(content/{ja,en}/**\/labs/*.yaml)
 * からexercise slugを解決し、既存の`LabWorkspace`(T-108/T-202、変更なし)を
 * マウントするだけの薄いページ。実行エンジン・状態機械・結果パネル等は
 * すべて再利用する。
 *
 * `generateStaticParams`は持たない(T-102/T-103決定事項ログ: 静的シェル化
 * すると、workerd上で未列挙パラメータへの`notFound()`が`DYNAMIC_SERVER_USAGE`
 * エラーになるため、`/learn/[module]`・`/learn/[module]/[lesson]`・
 * `/learn/[module]/quiz`と同じく常時動的レンダリングとする)。
 */
function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string; exercise: string }>;
}): Promise<Metadata> {
  const { locale, module: moduleSlug, exercise: exerciseSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  const data = buildLabPageData(locale, moduleSlug, exerciseSlug, detail);
  if (!data) {
    notFound();
  }
  const t = getMessages(locale).moduleDetail;
  return {
    title: `${formatMessage(t.exerciseItemLabel, { index: data.index })} | ${data.moduleTitle}`,
    alternates: { languages: buildLanguageAlternates(`/learn/${moduleSlug}/lab/${exerciseSlug}`) },
  };
}

export default async function LabPage({
  params,
}: {
  params: Promise<{ locale: string; module: string; exercise: string }>;
}) {
  const { locale, module: moduleSlug, exercise: exerciseSlug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const detail = getModuleDetail(locale, moduleSlug);
  if (!detail) {
    notFound();
  }
  const data = buildLabPageData(locale, moduleSlug, exerciseSlug, detail);
  if (!data) {
    notFound();
  }

  const session = await auth();

  return (
    <LabWorkspace
      exercise={data.exercise}
      locale={locale}
      isAuthenticated={Boolean(session?.user?.id)}
      nextHref={data.nextHref}
    />
  );
}
