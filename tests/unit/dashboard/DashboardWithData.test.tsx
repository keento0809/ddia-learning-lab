// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DashboardWithData } from "@/components/dashboard/DashboardWithData";
import type {
  GetDashboardResponse,
  GetProgressResponse,
  GetSubmissionResponse,
} from "@/lib/contracts";

/**
 * T-112「描画テスト」+「API統合」の橋渡し部分。DashboardWithDataはGET
 * /api/dashboard・GET /api/progress・(演習ごとの)GET /api/submissionsの3つを
 * 集約するclient wrapperのため、msw(tests/unit/lesson/CompleteAndNextButton.test.tsx
 * で確立済みのパターン)で3エンドポイントをモックし、実データが画面へ反映される
 * ことを検証する。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const DASHBOARD_RESPONSE: GetDashboardResponse = {
  overall: { lessonsDone: 1, lessonsTotal: 2, exercisesPassed: 1 },
  modules: [{ slug: "01-reliability", percent: 50 }],
  resume: null,
  streak: { currentDays: 3, longestDays: 3 },
  badges: [],
};

const PROGRESS_RESPONSE: GetProgressResponse = {
  progress: [
    {
      id: "p1",
      itemType: "exercise",
      itemSlug: "01-reliability/percentile-lab",
      status: "done",
      score: 100,
      completedAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
  ],
};

const SUBMISSION_RESPONSE: GetSubmissionResponse = {
  submission: {
    id: "sub-1",
    exerciseSlug: "01-reliability/percentile-lab",
    language: "js",
    code: "export function percentile() {}",
    result: "pass",
    passedTests: 3,
    totalTests: 3,
    durationMs: 90,
    graderVersion: "1.0.0",
    createdAt: "2026-07-19T00:00:00.000Z",
  },
};

const server = setupServer(
  http.get("/api/dashboard", () => HttpResponse.json(DASHBOARD_RESPONSE)),
  http.get("/api/progress", () => HttpResponse.json(PROGRESS_RESPONSE)),
  http.get("/api/submissions", () => HttpResponse.json(SUBMISSION_RESPONSE)),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

async function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
}

describe("DashboardWithData (T-112 msw integration)", () => {
  it("fetches GET /api/dashboard + GET /api/progress + GET /api/submissions and renders the aggregated result", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <NextIntlClientProvider locale="ja" messages={{}}>
            <DashboardWithData locale="ja" curriculumModules={[]} isAuthenticated />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    });

    // qa-evaluator指摘: GET /api/dashboard未解決の間は0件のダミー値ではなく
    // 読み込み中状態を表示し、「進捗ゼロ」と区別できることを確認する。
    expect(container.querySelector('[data-testid="dashboard-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dashboard-resume-empty-cta"]')).toBeNull();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="dashboard-submission-row"]')).not.toBeNull();
    });

    expect(container.querySelector('[data-testid="dashboard-streak-current"]')?.textContent).toBe(
      "3日連続",
    );
    expect(container.querySelector('[data-testid="dashboard-resume-empty-cta"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dashboard-submission-row"]')?.textContent,
    ).toContain("01-reliability/percentile-lab");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an error state instead of a fake zero-progress dashboard when GET /api/dashboard fails", async () => {
    server.use(
      http.get("/api/dashboard", () => HttpResponse.json({ title: "internal_error" }, { status: 500 })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <NextIntlClientProvider locale="ja" messages={{}}>
            <DashboardWithData locale="ja" curriculumModules={[]} isAuthenticated />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="dashboard-error"]')).not.toBeNull();
    });
    // 失敗時に0件のダミー値を「進捗ゼロ」として偽装表示しないこと。
    expect(container.querySelector('[data-testid="dashboard-resume-empty-cta"]')).toBeNull();
    expect(container.querySelector('[data-testid="dashboard-streak"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
