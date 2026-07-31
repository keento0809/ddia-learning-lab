// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PostSubmissionRequest,
  PostSubmissionResponse,
  PutProgressRequest,
  PutProgressResponse,
} from "@/lib/contracts";
import type { RunResult } from "@/lib/contracts/runner";
import { getDemoExercise } from "@/lib/lab/demoExercise";
import { DEFAULT_PANE_WIDTH_PERCENT, useLabStore } from "@/lib/store/labStore";

/**
 * T-108e受入基準「全テスト合格時にPOST /api/submissions(pass)とPUT /api/progress
 * (done, score)が02§3.2のシーケンスどおり送信される」「失敗/タイムアウト時も
 * submission(fail/timeout)が送信される」「送信成功時に合格演出+次レッスン導線が
 * 表示される」のmsw(モックサーバ)統合テスト。
 *
 * CodeEditor(Monaco、next/dynamic ssr:false)はjsdom上でCDNからMonaco本体を
 * 取得しようとし単体テストと相性が悪いため、この提出フロー自体には無関係な
 * サブコンポーネントとしてスタブに差し替える(既存の`renderToStaticMarkup`ベースの
 * `LabWorkspace.test.tsx`はMonacoをマウントしないため元々この問題を踏んでいない)。
 * コード自体はMonaco操作ではなくlabStoreへ直接ensureEntryで投入する。
 *
 * `runExercise`(採点Worker呼び出し、T-107c)は実Workerに依存するため、
 * `lib/runner/jsRunner.ts`をモックしてテストごとに固定のRunResultを返す。
 */
vi.mock("@/components/lab/CodeEditor", () => ({
  CodeEditor: () => null,
}));

const runExerciseMock = vi.fn<(request: unknown) => Promise<RunResult>>();
vi.mock("@/lib/runner/jsRunner", () => ({
  runExercise: (request: unknown) => runExerciseMock(request),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const exercise = getDemoExercise("ja");
const NEXT_HREF = "/learn/lab-preview-demo";

let submissionRequests: PostSubmissionRequest[] = [];
let progressRequests: PutProgressRequest[] = [];

const server = setupServer(
  http.post("/api/submissions", async ({ request }) => {
    const body = (await request.json()) as PostSubmissionRequest;
    submissionRequests.push(body);
    return HttpResponse.json<PostSubmissionResponse>({ id: "sub-1" }, { status: 201 });
  }),
  http.put("/api/progress", async ({ request }) => {
    const body = (await request.json()) as PutProgressRequest;
    progressRequests.push(body);
    return HttpResponse.json<PutProgressResponse>({
      progress: {
        id: "progress-1",
        itemType: "exercise",
        itemSlug: body.itemSlug,
        status: "done",
        score: body.score ?? null,
        completedAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
      streak: { currentDays: 1, longestDays: 1 },
      newBadges: [],
    });
  }),
  http.get("/api/progress", () => HttpResponse.json({ progress: [] })),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useLabStore.setState({ entries: {}, paneWidthPercent: DEFAULT_PANE_WIDTH_PERCENT });
  runExerciseMock.mockReset();
  submissionRequests = [];
  progressRequests = [];
  document.cookie = "csrf-token=test-csrf-token";
});

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await flush();
    }
  }
}

async function renderLabWorkspace(isAuthenticated: boolean) {
  useLabStore.getState().ensureEntry(exercise.slug, "export function clamp(value, min, max) { return value; }");

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container, root } = mountContainer();

  // 動的importはトップレベルの`vi.mock`より後に評価されるため、コンポーネント
  // モジュール自体もここで動的に読み込む(CompleteAndNextButton.test.tsxと違い、
  // このファイルではモック対象のCodeEditor/jsRunnerをLabWorkspaceが直接importする)。
  const { LabWorkspace } = await import("@/components/lab/LabWorkspace");

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ja" messages={{}}>
          <LabWorkspace
            exercise={exercise}
            locale="ja"
            isAuthenticated={isAuthenticated}
            nextHref={NEXT_HREF}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });

  return { container, root };
}

describe("LabWorkspace submission integration (T-108e, 02§3.2)", () => {
  it("on pass: POSTs submission(pass) then PUTs progress(done, score:100), then shows celebration + next lesson link", async () => {
    runExerciseMock.mockResolvedValue({
      result: "pass",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: true },
        { id: "t3", pass: true },
      ],
      logs: [],
      durationMs: 8,
    });

    const { container, root } = await renderLabWorkspace(true);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!.click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lab-status-label"]')?.textContent).toBe("合格");
    });

    await waitFor(() => {
      expect(submissionRequests).toHaveLength(1);
    });
    expect(submissionRequests[0]).toMatchObject({
      exerciseSlug: exercise.slug,
      language: "js",
      result: "pass",
      passedTests: 3,
      totalTests: 3,
    });

    await waitFor(() => {
      expect(progressRequests).toHaveLength(1);
    });
    expect(progressRequests[0]).toMatchObject({
      itemType: "exercise",
      itemSlug: exercise.slug,
      status: "done",
      score: 100,
    });

    // 02§3.2「合格演出 + 次レッスン導線」。lib/i18n/navigationのLinkが
    // ロケールプレフィックス(/ja)を自動付与する(ModuleDetail.tsxのnextHref
    // 使用箇所と同じ挙動)。
    await waitFor(() => {
      const link = container.querySelector<HTMLAnchorElement>('[data-testid="lab-next-lesson-link"]');
      expect(link).not.toBeNull();
      expect(link!.getAttribute("href")).toBe(`/ja${NEXT_HREF}`);
    });

    // submission(pass) → progress(done) の順で送信される(02§3.2シーケンス図)
    expect(submissionRequests).toHaveLength(1);
    expect(progressRequests).toHaveLength(1);

    await flush();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("on fail: POSTs submission(fail) only, no progress PUT, no celebration banner", async () => {
    runExerciseMock.mockResolvedValue({
      result: "fail",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: false },
        { id: "t3", pass: true },
      ],
      logs: [],
      durationMs: 6,
    });

    const { container, root } = await renderLabWorkspace(true);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!.click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lab-status-label"]')?.textContent).toBe("不合格");
    });

    await waitFor(() => {
      expect(submissionRequests).toHaveLength(1);
    });
    expect(submissionRequests[0]).toMatchObject({ result: "fail", passedTests: 2, totalTests: 3 });

    await flush();
    expect(progressRequests).toHaveLength(0);
    expect(container.querySelector('[data-testid="lab-submission-banner"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("on timeout: POSTs submission(timeout) only", async () => {
    runExerciseMock.mockResolvedValue({ result: "timeout", logs: [], durationMs: 3000 });

    const { container, root } = await renderLabWorkspace(true);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!.click();
    });

    await waitFor(() => {
      expect(submissionRequests).toHaveLength(1);
    });
    expect(submissionRequests[0]).toMatchObject({ result: "timeout", passedTests: 0 });
    expect(progressRequests).toHaveLength(0);

    await flush();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("when unauthenticated: sends no submission/progress requests and shows a sign-in note instead of celebration", async () => {
    runExerciseMock.mockResolvedValue({
      result: "pass",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: true },
        { id: "t3", pass: true },
      ],
      logs: [],
      durationMs: 8,
    });

    const { container, root } = await renderLabWorkspace(false);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!.click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lab-status-label"]')?.textContent).toBe("合格");
    });

    await flush();
    expect(submissionRequests).toHaveLength(0);
    expect(progressRequests).toHaveLength(0);
    expect(container.querySelector('[data-testid="lab-next-lesson-link"]')).toBeNull();
    expect(container.querySelector('[data-testid="lab-submission-banner"]')?.textContent).toContain(
      "サインイン",
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("on pass, when POST /api/submissions itself fails: shows the submit-error banner instead of celebration (test-integrity-reviewer follow-up)", async () => {
    server.use(
      http.post("/api/submissions", () =>
        HttpResponse.json({ type: "about:blank#internal", title: "internal_error", status: 500 }, { status: 500 }),
      ),
    );
    runExerciseMock.mockResolvedValue({
      result: "pass",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: true },
        { id: "t3", pass: true },
      ],
      logs: [],
      durationMs: 8,
    });

    const { container, root } = await renderLabWorkspace(true);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!.click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lab-submission-error"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="lab-submission-error"]')?.textContent).toBe(
      "提出結果の送信に失敗しました",
    );
    expect(container.querySelector('[data-testid="lab-next-lesson-link"]')).toBeNull();
    // 提出自体が失敗したため進捗PUTは送信されない(02§3.2のsubmission→progressの順序どおり)
    expect(progressRequests).toHaveLength(0);

    await flush();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("qa-evaluator finding: a rapid re-click of 実行 while a submission is in flight sends only one POST /api/submissions", async () => {
    // 通常のJS演習は採点が数msで終わりstatusがすぐ再実行可能な終端状態に戻るため、
    // POST /api/submissionsに人為的な遅延を入れないと「素早い連続クリック」を
    // 再現できない(qa-evaluatorが実ブラウザで検出した競合の再現条件)。
    let resolveFirstSubmission: (() => void) | undefined;
    let requestCount = 0;
    server.use(
      http.post("/api/submissions", async ({ request }) => {
        const body = (await request.json()) as PostSubmissionRequest;
        requestCount += 1;
        if (requestCount === 1) {
          await new Promise<void>((resolve) => {
            resolveFirstSubmission = resolve;
          });
        }
        submissionRequests.push(body);
        return HttpResponse.json<PostSubmissionResponse>({ id: "sub-1" }, { status: 201 });
      }),
    );
    runExerciseMock.mockResolvedValue({
      result: "pass",
      perTest: [
        { id: "t1", pass: true },
        { id: "t2", pass: true },
        { id: "t3", pass: true },
      ],
      logs: [],
      durationMs: 8,
    });

    const { container, root } = await renderLabWorkspace(true);
    const runButton = () => container.querySelector<HTMLButtonElement>('[data-testid="lab-run-button"]')!;

    act(() => {
      runButton().click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lab-status-label"]')?.textContent).toBe("合格");
    });
    // submissionInFlightがtrueになった時点でボタン自体がdisabledになる
    // (LabToolbar.tsx、qa-evaluator指摘の恒久対策)。disabledなbuttonへの.click()は
    // ネイティブDOMの仕様上onClickを一切発火しないため、これは実ブラウザの
    // 「無効化されたボタンをクリックしても何も起きない」動作をそのまま再現する。
    await waitFor(() => {
      expect(runButton().disabled).toBe(true);
    });

    act(() => {
      runButton().click();
      runButton().click();
    });

    resolveFirstSubmission?.();
    await waitFor(() => {
      expect(submissionRequests).toHaveLength(1);
    });
    await waitFor(() => {
      expect(runButton().disabled).toBe(false);
    });
    // 送信完了後に再度クリックすれば新たな1件が送信される(ガードの対象は
    // 「送信中の再クリック」のみで、恒久的にボタンを壊しているわけではない)。
    act(() => {
      runButton().click();
    });
    await waitFor(() => {
      expect(submissionRequests).toHaveLength(2);
    });

    await flush();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
