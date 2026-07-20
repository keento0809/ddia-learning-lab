"use client";

import { useProgressQuery } from "@/lib/progress/useProgressQuery";
import { useDashboardQuery } from "@/lib/dashboard/useDashboardQuery";
import { useRecentSubmissionsQuery } from "@/lib/dashboard/useRecentSubmissionsQuery";
import { computeActivityHeatmap } from "@/lib/dashboard/heatmap";
import type { Locale } from "@/lib/i18n/messages";
import type { CurriculumModuleSummary } from "@/lib/curriculum";
import type { GetDashboardResponse } from "@/lib/contracts";
import { Dashboard } from "./Dashboard";
import { DashboardStatus } from "./DashboardStatus";

const EMPTY_DASHBOARD: GetDashboardResponse = {
  overall: { lessonsDone: 0, lessonsTotal: 0, exercisesPassed: 0 },
  modules: [],
  resume: null,
  streak: { currentDays: 0, longestDays: 0 },
  badges: [],
};

/**
 * S-07 ダッシュボードへの実データ接続(T-112)。Dashboard自体はhookを使わない
 * 純粋な描画コンポーネントのまま保ち(components/curriculum/CurriculumListWithProgress.tsx
 * と同じ既存パターン)、ここでGET /api/dashboard・GET /api/progress・
 * (演習ごとの)GET /api/submissionsの結果を集約してpropとして注入する。
 */
export function DashboardWithData({
  locale,
  curriculumModules,
  isAuthenticated,
}: {
  locale: Locale;
  curriculumModules: readonly CurriculumModuleSummary[];
  isAuthenticated: boolean;
}) {
  const dashboardQuery = useDashboardQuery({ enabled: isAuthenticated });
  const progressQuery = useProgressQuery({ enabled: isAuthenticated });
  const progressRecords = progressQuery.data?.progress ?? [];
  const { data: recentSubmissions } = useRecentSubmissionsQuery(progressRecords, {
    enabled: isAuthenticated,
  });

  if (isAuthenticated && dashboardQuery.isLoading) {
    return <DashboardStatus locale={locale} kind="loading" />;
  }
  if (isAuthenticated && dashboardQuery.isError) {
    return <DashboardStatus locale={locale} kind="error" />;
  }

  return (
    <Dashboard
      locale={locale}
      curriculumModules={curriculumModules}
      dashboard={dashboardQuery.data ?? EMPTY_DASHBOARD}
      heatmapDays={computeActivityHeatmap(progressRecords)}
      recentSubmissions={recentSubmissions}
    />
  );
}
