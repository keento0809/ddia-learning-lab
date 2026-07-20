import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { Streak } from "@/lib/contracts";

/** S-07「ストリーク」(02§4.4中段) */
export function StreakDisplay({ locale, streak }: { locale: Locale; streak: Streak }) {
  const t = getMessages(locale).dashboard.streak;

  return (
    <section aria-labelledby="dashboard-streak-heading" data-testid="dashboard-streak" className="mb-6">
      <h2 id="dashboard-streak-heading" className="mb-2 text-lg font-semibold">
        {t.heading}
      </h2>
      <p className="text-2xl font-semibold" data-testid="dashboard-streak-current">
        {formatMessage(t.currentLabel, { days: streak.currentDays })}
      </p>
      {streak.longestDays !== undefined && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400" data-testid="dashboard-streak-longest">
          {formatMessage(t.longestLabel, { days: streak.longestDays })}
        </p>
      )}
    </section>
  );
}
