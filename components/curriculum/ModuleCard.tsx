import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { ProgressRing } from "./ProgressRing";
import type { ModuleMeta } from "@/lib/contracts/module";

/**
 * S-02 モジュールカード(02§4.3「各モジュールをカードで表示
 * (タイトル/所要時間/レッスン数/進捗リング)」)。
 *
 * `locked`(T-603、ADR-009 §3.2)はモジュール一覧上の鍵アイコン表示のみを
 * 制御する表示上の配慮であり、アクセス可否そのものの判定はサーバ側
 * (T-602、layer1)が担う(呼び出し側のCurriculumListが
 * `lib/uiAccessTier.ts`で算出して渡す)。
 */
export function ModuleCard({
  locale,
  meta,
  lessonCount,
  progressPercent,
  locked,
}: {
  locale: Locale;
  meta: ModuleMeta;
  lessonCount: number;
  progressPercent: number;
  locked: boolean;
}) {
  const t = getMessages(locale).curriculum;

  return (
    <li>
      <Link
        href={`/learn/${meta.slug}`}
        prefetch={false}
        data-testid={`curriculum-module-${meta.slug}`}
        className="flex items-center gap-3 rounded border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
      >
        <div className="flex-1">
          <p className="flex items-center gap-1.5 font-medium">
            {meta.title}
            {locked ? (
              <span
                role="img"
                aria-label={t.moduleLockedLabel}
                title={t.moduleLockedLabel}
                data-testid={`curriculum-module-lock-${meta.slug}`}
                className="shrink-0 text-neutral-400 dark:text-neutral-600"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 1 1 6 0v3Zm3 3a2 2 0 0 1 1 3.73V18a1 1 0 1 1-2 0v-2.27A2 2 0 0 1 12 12Z" />
                </svg>
              </span>
            ) : null}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {`${formatMessage(t.minutesLabel, { minutes: meta.minutes })} · ${formatMessage(t.lessonCountLabel, { count: lessonCount })}`}
          </p>
        </div>
        <ProgressRing
          percent={progressPercent}
          label={formatMessage(t.progressAriaLabel, { percent: progressPercent })}
        />
      </Link>
    </li>
  );
}
