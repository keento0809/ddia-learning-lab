import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { LabAccessNotice } from "@/components/lab/LabAccessNotice";
import { getModuleDetail, exerciseRouteSegment } from "@/lib/moduleDetail";
import { buildLabPageData } from "@/lib/labPage";
import { getModuleAccessTier, isModuleFullyVisibleUnauthenticated } from "@/lib/moduleAccess";
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

  /**
   * T-604(ADR-009 §5層1・§6)。タイトル生成に演習の本体(template/tests)は
   * 不要なため、`buildLabPageData`/`getExercise`(演習YAML全体を読み込む)は
   * 呼ばない。目次上の通し番号は`detail.exercises`(公開メタデータ、
   * `LabPage`本体のexerciseExists判定と同じ導出)から直接求める
   * (`app/[locale]/learn/[module]/quiz/page.tsx`のgenerateMetadataが
   * `getQuiz`を呼ばないのと同じ設計)。
   */
  const index = detail.exercises.findIndex(
    (item) => exerciseRouteSegment(moduleSlug, item.slug) === exerciseSlug,
  );
  if (index === -1) {
    notFound();
  }
  const t = getMessages(locale).moduleDetail;
  return {
    title: `${formatMessage(t.exerciseItemLabel, { index: index + 1 })} | ${detail.meta.title}`,
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

  const exerciseExists = detail.exercises.some(
    (item) => exerciseRouteSegment(moduleSlug, item.slug) === exerciseSlug,
  );
  if (!exerciseExists) {
    notFound();
  }

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  /**
   * T-604(ADR-009 §5層1・§6)。Gated階層かつ未認証の場合は演習YAML
   * (テスト定義・assert・テンプレート)を一切読み込まない
   * (`buildLabPageData`/`getExercise`を呼ばない)。RSCペイロード/HTMLに
   * 演習本体が一切含まれないことがこのタスクの受入基準(未認証時に
   * LabWorkspaceがツリーに含まれないことを証明するテスト、
   * tests/unit/lab/accessGate.test.ts参照)。ソフトウォールUIはT-603の
   * スコープ、ここではLabAccessNotice(最小プレースホルダ)で代替する。
   */
  const tier = getModuleAccessTier(detail.meta.order);
  if (!isAuthenticated && !isModuleFullyVisibleUnauthenticated(tier)) {
    return <LabAccessNotice locale={locale} />;
  }

  const data = buildLabPageData(locale, moduleSlug, exerciseSlug, detail);
  if (!data) {
    notFound();
  }

  return (
    <LabWorkspace
      exercise={data.exercise}
      locale={locale}
      isAuthenticated={isAuthenticated}
      nextHref={data.nextHref}
    />
  );
}
