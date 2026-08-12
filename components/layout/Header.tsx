import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AccountMenu } from "@/components/layout/AccountMenu";

/**
 * 01§7.2 ヘッダー仕様: ロゴ / カリキュラム / 用語集 / 検索 / 言語トグル /
 * ダーク・ライト切替 / アカウントメニュー。
 * /learn(T-101)・/glossary(T-305)・/search(T-306)・/settings(T-308)・
 * /auth/signin(T-005)はいずれも実装済みのため、本番ビルドでのビューポート内
 * 自動prefetchによる404 consoleエラー(T-007 qa-evaluatorで検出、STATUS.md
 * 決定事項ログ)を避けるためのprefetch={false}は外している。
 * isAuthenticatedはアカウントメニューの表示切替用。呼び出し元のlayout.tsxが
 * 既にGuestProgressImportGate向けに`auth()`結果を保持しているため、ここでは
 * 二重にセッション取得せずpropsで受け取る。AccountMenu.tsxと同じ
 * isAuthenticatedでロゴの遷移先も分岐させる: ログイン済みは/dashboardへ、
 * 未ログインは従来通り/(ランディング)へ。
 */
export function Header({ locale, isAuthenticated }: { locale: Locale; isAuthenticated: boolean }) {
  const t = getMessages(locale).nav;
  const logoHref = isAuthenticated ? "/dashboard" : "/";

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <Link href={logoHref} prefetch={false} className="font-semibold">
        {t.brand}
      </Link>
      <nav aria-label={t.mainAriaLabel} className="flex flex-wrap gap-4 text-sm">
        <Link href="/learn" className="hover:underline">
          {t.learn}
        </Link>
        <Link href="/glossary" className="hover:underline">
          {t.glossary}
        </Link>
        <Link href="/search" className="hover:underline">
          {t.search}
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <LocaleToggle locale={locale} />
        <ThemeToggle locale={locale} />
        <AccountMenu locale={locale} isAuthenticated={isAuthenticated} />
      </div>
    </header>
  );
}
