import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { getFreeTierModuleSlug } from "@/lib/curriculum";

/**
 * ADR-009(docs/design/10_ADR-009_アクセス制御設計.md)§3.2のソフトウォールUI(T-603)。
 * 多層防御の層4「UI」(同ADR §5)を担うのみで、アクセス可否そのものの判定は
 * サーバ側(層1、T-602: app/[locale]/learn/[module]/[lesson]/page.tsx +
 * lib/lessonAccess.ts)が行う。本コンポーネントは`previewHtml`の有無で
 * Preview階層(冒頭+フェードアウト+ウォール)とGated階層(ウォールのみ)を
 * 描き分けるだけの表示コンポーネント。
 */
export function ContentWall({
  locale,
  previewHtml,
}: {
  locale: Locale;
  previewHtml?: string;
}) {
  const t = getMessages(locale).lesson.contentWall;
  const freeTierModuleSlug = getFreeTierModuleSlug(locale);

  return (
    <div data-testid="content-wall">
      {previewHtml ? (
        <div className="relative">
          {/* ビルド時に生成した安全なHTML(ユーザー入力ではなく自チームの
              レッスンMDXから派生、lib/lessonPreview.ts参照) */}
          <div data-testid="content-wall-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <div
            aria-hidden="true"
            data-testid="content-wall-fade"
            className="pointer-events-none -mt-24 h-24 bg-gradient-to-t from-white to-transparent dark:from-neutral-950"
          />
        </div>
      ) : null}
      <div
        data-testid="content-wall-box"
        className="rounded border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-900"
      >
        <span
          role="img"
          aria-label={t.lockIconLabel}
          data-testid="content-wall-lock-icon"
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 1 1 6 0v3Zm3 3a2 2 0 0 1 1 3.73V18a1 1 0 1 1-2 0v-2.27A2 2 0 0 1 12 12Z" />
          </svg>
        </span>
        <p className="mb-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">{t.heading}</p>
        <ul
          data-testid="content-wall-value-props"
          className="mb-5 flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400"
        >
          <li>{t.valueProps.allModules}</li>
          <li>{t.valueProps.exercises}</li>
          <li>{t.valueProps.progress}</li>
        </ul>
        <div className="mb-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/signup"
            data-testid="content-wall-cta-signup"
            className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {t.signUpCtaLabel}
          </Link>
          <Link
            href="/auth/signin"
            data-testid="content-wall-cta-signin"
            className="rounded border border-neutral-300 px-4 py-2 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {t.signInCtaLabel}
          </Link>
        </div>
        {freeTierModuleSlug ? (
          <Link
            href={`/learn/${freeTierModuleSlug}`}
            prefetch={false}
            data-testid="content-wall-free-tier-link"
            className="text-sm underline underline-offset-2 hover:no-underline"
          >
            {t.freeTierLinkLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
