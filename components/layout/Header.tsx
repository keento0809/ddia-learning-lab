import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AccountMenu } from "@/components/layout/AccountMenu";

/**
 * 01§7.2 ヘッダー仕様: ロゴ / カリキュラム / 用語集 / 検索 / 言語トグル /
 * ダーク・ライト切替 / アカウントメニュー。
 * リンク先の /glossary /search /settings /auth は後続タスク(T-305, T-306,
 * T-005, T-010)で実装されるため、現時点では未実装ページとしてT-007成果物の
 * not-found(404)ページへフォールバックする。本番ビルドではNext.jsが
 * ビューポート内リンクを自動prefetchし、未実装ページ宛の場合はページを開いた
 * だけで404 consoleエラーが発生する(qa-evaluatorで検出)ため、prefetch={false}
 * で無効化する。/learn はT-101で実装済みのためprefetch制限を外した
 * (T-007決定事項ログで明記済みの、実装完了時の除去対象)。
 */
export function Header({ locale }: { locale: Locale }) {
  const t = getMessages(locale).nav;

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <Link href="/" prefetch={false} className="font-semibold">
        {t.brand}
      </Link>
      <nav aria-label={t.mainAriaLabel} className="flex flex-wrap gap-4 text-sm">
        <Link href="/learn" className="hover:underline">
          {t.learn}
        </Link>
        <Link href="/glossary" prefetch={false} className="hover:underline">
          {t.glossary}
        </Link>
        <Link href="/search" prefetch={false} className="hover:underline">
          {t.search}
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <LocaleToggle locale={locale} />
        <ThemeToggle locale={locale} />
        <AccountMenu locale={locale} />
      </div>
    </header>
  );
}
