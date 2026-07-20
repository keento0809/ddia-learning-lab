import { getMessages, type Locale } from "@/lib/i18n/messages";
import type { SubmissionRecord } from "@/lib/contracts";

function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

/**
 * S-07「最近の提出履歴テーブル」(02§4.4下段)。
 * GetDashboardResponseSchema(lib/contracts、変更禁止)には提出履歴フィールドが
 * 無いため、lib/dashboard/useRecentSubmissionsQuery.ts(既存のGET /api/submissions
 * を演習ごとに集約)が提供するデータをそのまま描画する。
 */
export function RecentSubmissionsTable({
  locale,
  submissions,
}: {
  locale: Locale;
  submissions: readonly SubmissionRecord[];
}) {
  const t = getMessages(locale).dashboard.submissions;

  return (
    <section
      aria-labelledby="dashboard-submissions-heading"
      data-testid="dashboard-submissions"
      className="mb-6"
    >
      <h2 id="dashboard-submissions-heading" className="mb-3 text-lg font-semibold">
        {t.heading}
      </h2>
      {submissions.length === 0 ? (
        <p
          data-testid="dashboard-submissions-empty"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {t.emptyLabel}
        </p>
      ) : (
        <table className="w-full text-left text-sm" data-testid="dashboard-submissions-table">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t.exerciseColumn}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t.resultColumn}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t.scoreColumn}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t.dateColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission) => (
              <tr key={submission.id} data-testid="dashboard-submission-row">
                <td className="py-1 pr-3">{submission.exerciseSlug}</td>
                <td className="py-1 pr-3">{t.result[submission.result]}</td>
                <td className="py-1 pr-3">{`${submission.passedTests}/${submission.totalTests}`}</td>
                <td className="py-1">{formatDateTime(submission.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
