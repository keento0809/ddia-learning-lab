import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { computeActivityHeatmap, type HeatmapDay } from "@/lib/dashboard/heatmap";
import type { CurriculumModuleSummary } from "@/lib/curriculum";
import type { GetDashboardResponse, SubmissionRecord } from "@/lib/contracts";

/**
 * 03文書T-112受入基準「描画テスト」。Dashboard自体はhookを使わない純粋な
 * 描画コンポーネント(components/curriculum/CurriculumList.tsxと同じ既存
 * パターン)のため、renderToStaticMarkup(components/module/ModuleDetail.test.tsxの
 * 既存パターン、`@/lib/i18n/navigation`のLinkがuseLocale()を要求するため
 * NextIntlClientProviderで包む)で直接検証する。
 */
function renderDashboard(props: {
  curriculumModules: readonly CurriculumModuleSummary[];
  dashboard: GetDashboardResponse;
  heatmapDays: readonly HeatmapDay[];
  recentSubmissions: readonly SubmissionRecord[];
}): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ja" messages={{}}>
      <Dashboard locale="ja" {...props} />
    </NextIntlClientProvider>,
  );
}

const MODULES: CurriculumModuleSummary[] = [
  { meta: { slug: "01-reliability", title: "信頼性", order: 1, minutes: 30 }, lessonCount: 2 },
  { meta: { slug: "05-replication", title: "レプリケーション", order: 5, minutes: 40 }, lessonCount: 3 },
];

const BASE_DASHBOARD: GetDashboardResponse = {
  overall: { lessonsDone: 3, lessonsTotal: 5, exercisesPassed: 1 },
  modules: [
    { slug: "01-reliability", percent: 100 },
    { slug: "05-replication", percent: 0 },
  ],
  resume: { itemType: "lesson", itemSlug: "05-replication/02-lag", titleKey: "05-replication/02-lag" },
  streak: { currentDays: 4, longestDays: 11 },
  badges: [{ slug: "part1-complete", grantedAt: "2026-07-01T00:00:00.000Z" }],
};

const SUBMISSION: SubmissionRecord = {
  id: "sub-1",
  exerciseSlug: "01-reliability/percentile-lab",
  language: "js",
  code: "export function percentile() {}",
  result: "pass",
  passedTests: 3,
  totalTests: 3,
  durationMs: 120,
  graderVersion: "1.0.0",
  createdAt: "2026-07-19T00:00:00.000Z",
};

describe("Dashboard", () => {
  it("renders resume/part-progress/heatmap/streak/badges/submissions sections", () => {
    const html = renderDashboard({
      curriculumModules: MODULES,
      dashboard: BASE_DASHBOARD,
      heatmapDays: computeActivityHeatmap([], new Date("2026-07-20T00:00:00.000Z")),
      recentSubmissions: [SUBMISSION],
    });

    expect(html).toContain('data-testid="dashboard-resume"');
    expect(html).toContain('data-testid="dashboard-resume-cta"');
    expect(html).toContain('data-testid="dashboard-part-progress"');
    expect(html).toContain('data-testid="dashboard-part-I"');
    expect(html).toContain('data-testid="dashboard-part-II"');
    expect(html).toContain('data-testid="dashboard-heatmap"');
    expect(html).toContain('data-testid="dashboard-streak"');
    expect(html).toContain("4日連続");
    expect(html).toContain('data-testid="dashboard-badges"');
    expect(html).toContain('data-testid="dashboard-badge-granted"');
    expect(html).toContain('data-testid="dashboard-badge-locked"');
    expect(html).toContain('data-testid="dashboard-submissions-table"');
    expect(html).toContain('data-testid="dashboard-submission-row"');
    expect(html).toContain("01-reliability/percentile-lab");
  });

  it("part progress bar averages module percents within each Part (Part I=100%, Part II=0%)", () => {
    const html = renderDashboard({
      curriculumModules: MODULES,
      dashboard: BASE_DASHBOARD,
      heatmapDays: [],
      recentSubmissions: [],
    });
    const partISection = html.split('data-testid="dashboard-part-I"')[1]!.split("</li>")[0]!;
    const partIISection = html.split('data-testid="dashboard-part-II"')[1]!.split("</li>")[0]!;
    expect(partISection).toContain("100%");
    expect(partIISection).toContain("0%");
  });

  it("renders empty states when there is no resume item and no submissions", () => {
    const html = renderDashboard({
      curriculumModules: MODULES,
      dashboard: { ...BASE_DASHBOARD, resume: null, badges: [] },
      heatmapDays: [],
      recentSubmissions: [],
    });
    expect(html).toContain('data-testid="dashboard-resume-empty-cta"');
    expect(html).not.toContain('data-testid="dashboard-resume-cta"');
    expect(html).toContain('data-testid="dashboard-submissions-empty"');
    expect(html).not.toContain('data-testid="dashboard-badge-granted"');
  });

  it("resolves the resume card's title fallback to the module slug when the module is unknown", () => {
    const html = renderDashboard({
      curriculumModules: MODULES,
      dashboard: {
        ...BASE_DASHBOARD,
        resume: { itemType: "exercise", itemSlug: "99-unknown/x", titleKey: "99-unknown/x" },
      },
      heatmapDays: [],
      recentSubmissions: [],
    });
    expect(html).toContain("99-unknown");
  });
});
