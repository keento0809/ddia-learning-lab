import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchPage } from "@/components/search/SearchPage";
import { getMessages } from "@/lib/i18n/messages";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { buildLanguageAlternates } from "@/lib/i18n/alternates";
import { auth } from "@/lib/auth/config";

/**
 * T-604(ADR-009 §6)。以前は`generateStaticParams`でSSGしていた。
 * `auth()`(§5層1)を呼ぶ現在の実装のままにすると、`generateStaticParams`を
 * 削除した後もNext.jsが本ルートをビルド時に一度だけ静的プレレンダリングして
 * しまうことを実ビルドで確認した(出力が`ƒ`(動的)にならず`●`(SSG)のまま。
 * `.next`キャッシュの問題ではないことも、キャッシュを完全に削除した
 * クリーンビルドで再現することを確認済み)。quiz/lab/lessonページ
 * (T-602/T-108r/T-106)の`auth()`呼び出しはNext標準の動的APIバイパス検知で
 * `ƒ`化される一方、本ルートではその自動検知が働かない(原因未特定、Auth.js v5
 * の`auth()`実装がプレレンダリング時に例外を投げず`null`セッションへ
 * サイレントフォールバックしている可能性が高い)。暗黙の自動検知に依存すると
 * `isAuthenticated`がビルド時点(常にセッション無し)の値へ固定され全訪問者に
 * 配信される致命的セキュリティ上の不具合になるため、`dynamic = "force-dynamic"`
 * で明示的に強制する(検索インデックス自体はビルド時生成の静的JSONのまま、
 * ページ側のauth()判定のみ動的化する)。
 */
export const dynamic = "force-dynamic";

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
    title: getMessages(locale).search.pageTitle,
    alternates: { languages: buildLanguageAlternates("/search") },
  };
}

/**
 * S-09 検索結果画面(`/ja/search?q=`、01基本設計書の画面一覧)。ページ自体は
 * ログイン不要(ADR-009 §3.1 Public)。ただし配信する検索インデックス
 * (静的アセット)はT-604(ADR-009 §6)によりGated階層のレッスン本文を
 * 含むか否かで2種類に分かれるため、`auth()`結果を`SearchPage`(Client
 * Component)へpropとして渡し、どちらを取得するか選択させる
 * (quiz/labページと同じ既存パターン、components/search/SearchPage.tsx参照)。
 */
export default async function LocaleSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const { q } = await searchParams;
  const session = await auth();

  return (
    <SearchPage locale={locale} initialQuery={q ?? ""} isAuthenticated={Boolean(session?.user?.id)} />
  );
}
