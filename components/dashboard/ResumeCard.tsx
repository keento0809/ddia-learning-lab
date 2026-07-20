import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { DashboardOverall, DashboardResume } from "@/lib/contracts";
import { resolveResumeDisplay, resolveResumeHref } from "@/lib/dashboard/resumeTitle";

/**
 * S-07「続きから再開」大型カード(02§4.4上段)。直近のin_progressアイテムへの
 * 導線。in_progressが無い場合はカリキュラムへのCTAを表示する。
 */
export function ResumeCard({
  locale,
  resume,
  overall,
}: {
  locale: Locale;
  resume: DashboardResume | null;
  overall: DashboardOverall;
}) {
  const t = getMessages(locale).dashboard;

  return (
    <section aria-labelledby="dashboard-resume-heading" data-testid="dashboard-resume" className="mb-8">
      <h2 id="dashboard-resume-heading" className="mb-3 text-lg font-semibold">
        {t.resume.heading}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        {resume ? (
          <ResumeContent locale={locale} resume={resume} />
        ) : (
          <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xl font-semibold">{t.resume.emptyTitle}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.resume.emptyBody}</p>
            </div>
            <Link
              href="/learn"
              data-testid="dashboard-resume-empty-cta"
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {t.resume.emptyCta}
            </Link>
          </div>
        )}
      </div>
      <p
        data-testid="dashboard-overall-summary"
        className="mt-3 text-sm text-neutral-600 dark:text-neutral-400"
      >
        {formatMessage(t.overall.lessonsLabel, { done: overall.lessonsDone, total: overall.lessonsTotal })}
        {" · "}
        {formatMessage(t.overall.exercisesPassedLabel, { count: overall.exercisesPassed })}
      </p>
    </section>
  );
}

function ResumeContent({ locale, resume }: { locale: Locale; resume: DashboardResume }) {
  const t = getMessages(locale).dashboard;
  const display = resolveResumeDisplay(locale, resume.itemType, resume.itemSlug);
  const itemLabel =
    display.lessonTitle ?? (resume.itemType === "quiz" ? t.resume.quizLabel : t.resume.exerciseLabel);

  return (
    <>
      <div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{display.moduleTitle}</p>
        <p className="text-xl font-semibold">{itemLabel}</p>
      </div>
      <Link
        href={resolveResumeHref(resume.itemType, resume.itemSlug)}
        data-testid="dashboard-resume-cta"
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {t.resume.cta}
      </Link>
    </>
  );
}
