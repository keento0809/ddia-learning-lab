import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { ProgressRing } from "./ProgressRing";
import type { ModuleMeta } from "@/lib/contracts/module";

/**
 * S-02 モジュールカード(02§4.3「各モジュールをカードで表示
 * (タイトル/所要時間/レッスン数/進捗リング)」)。
 */
export function ModuleCard({
  locale,
  meta,
  lessonCount,
  progressPercent,
}: {
  locale: Locale;
  meta: ModuleMeta;
  lessonCount: number;
  progressPercent: number;
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
          <p className="font-medium">{meta.title}</p>
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
