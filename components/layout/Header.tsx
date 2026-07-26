import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AccountMenu } from "@/components/layout/AccountMenu";

/**
 * 01§7.2 ヘッダー仕様: ロゴ / カリキュラム / 用語集 / 検索 / 言語トグル /
 * ダーク・ライト切替 / アカウントメニュー。
 * リンク先の /search /settings /auth は後続タスク(T-306, T-005, T-010)で
 * 実装されるため、現時点では未実装ページとしてT-007成果物のnot-found(404)
 * ページへフォールバックする。本番ビルドではNext.jsがビューポート内リンクを
 * 自動prefetchし、未実装ページ宛の場合はページを開いただけで404 console
 * エラーが発生する(qa-evaluatorで検出)ため、prefetch={false}で無効化する。
 * /learn(T-101)・/glossary(T-305)は実装済みのためprefetch制限を外した
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
        <Link href="/glossary" className="hover:underline">
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
