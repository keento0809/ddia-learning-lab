import { getMessages, type Locale } from "@/lib/i18n/messages";
import type { CurriculumModuleSummary } from "@/lib/curriculum";
import type { GetDashboardResponse, SubmissionRecord } from "@/lib/contracts";
import type { HeatmapDay } from "@/lib/dashboard/heatmap";
import { ResumeCard } from "./ResumeCard";
import { PartProgressBars } from "./PartProgressBars";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { StreakDisplay } from "./StreakDisplay";
import { BadgeGrid } from "./BadgeGrid";
import { RecentSubmissionsTable } from "./RecentSubmissionsTable";

/**
 * S-07 ダッシュボード(02§4.4、03文書T-112)。フックを使わない純粋な描画
 * コンポーネント(components/curriculum/CurriculumList.tsxと同じ既存パターン)。
 * 実データ接続はDashboardWithData.tsxが担う。
 */
export function Dashboard({
  locale,
  curriculumModules,
  dashboard,
  heatmapDays,
  recentSubmissions,
}: {
  locale: Locale;
  curriculumModules: readonly CurriculumModuleSummary[];
  dashboard: GetDashboardResponse;
  heatmapDays: readonly HeatmapDay[];
  recentSubmissions: readonly SubmissionRecord[];
}) {
  const t = getMessages(locale).dashboard;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      <ResumeCard locale={locale} resume={dashboard.resume} overall={dashboard.overall} />
      <PartProgressBars locale={locale} modules={curriculumModules} progress={dashboard.modules} />
      <ActivityHeatmap locale={locale} days={heatmapDays} />
      <StreakDisplay locale={locale} streak={dashboard.streak} />
      <BadgeGrid locale={locale} badges={dashboard.badges} />
      <RecentSubmissionsTable locale={locale} submissions={recentSubmissions} />
    </main>
  );
}
