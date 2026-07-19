// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CompleteAndNextButton } from "@/components/lesson/CompleteAndNextButton";
import { PROGRESS_QUERY_KEY } from "@/lib/progress/useProgressQuery";
import { useSerializedProgressMutation } from "@/lib/progress/useSerializedProgressMutation";
import { useProgressStore } from "@/lib/store/progressStore";
import { GUEST_PROGRESS_STORAGE_KEY, readGuestProgress } from "@/lib/progress/guestProgress";
import type { GetProgressResponse, PutProgressResponse } from "@/lib/contracts";

/**
 * T-105受入基準「msw(モックサーバ)でのmutation成功/失敗/ロールバックの
 * コンポーネントテスト」。CompleteAndNextButton(「完了して次へ」)は
 * useMarkProgressMutation(TanStack Query mutation)を使い、PUT /api/progress
 * を楽観更新する。@testing-library/reactは導入せず(このリポジトリの既存
 * テストパターン、tests/unit/lesson/LessonLayout.test.tsx等はreact-dom/server
 * や直接呼び出しで完結させている慣習)、react-dom/client + reactのactのみで
 * 実DOM上のクリック操作を検証する。
 */
// Reactの公式act()環境フラグ。未設定だと「not configured to support act(...)」警告が出る。
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ITEM_SLUG = "01-reliability/01-intro";

const server = setupServer(
  http.put("/api/progress", () =>
    HttpResponse.json<PutProgressResponse>({
      progress: {
        id: "server-1",
        itemType: "lesson",
        itemSlug: ITEM_SLUG,
        status: "done",
        score: null,
        completedAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
      streak: { currentDays: 1, longestDays: 1 },
      newBadges: [],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useProgressStore.setState({ bySlug: {} });
});

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

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

/**
 * CompleteAndNextButtonはT-105の恒久対策(コンポーネント内コメント参照)により
 * mutation/dispatchを呼び出し側(実プロダクションコードではLessonLayout)から
 * 受け取る設計のため、テストでも同じくuseSerializedProgressMutation()を1回
 * 呼び出すホストコンポーネント経由でレンダーする。
 */
function Host({
  itemSlug,
  onCompleted,
  isAuthenticated = true,
  onGuestComplete = () => {},
}: {
  itemSlug: string;
  onCompleted: () => void;
  isAuthenticated?: boolean;
  onGuestComplete?: () => void;
}) {
  const { mutation, dispatch } = useSerializedProgressMutation();
  return (
    <CompleteAndNextButton
      locale="ja"
      itemSlug={itemSlug}
      mutation={mutation}
      dispatch={dispatch}
      isAuthenticated={isAuthenticated}
      onGuestComplete={onGuestComplete}
      onCompleted={onCompleted}
    />
  );
}

describe("CompleteAndNextButton (T-105 msw mutation test)", () => {
  it("optimistically marks the lesson done and calls onCompleted on success", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onCompleted = vi.fn();
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Host itemSlug={ITEM_SLUG} onCompleted={onCompleted} />
        </QueryClientProvider>,
      );
    });

    const button = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="lesson-complete-next"]')!;
    expect(button().textContent).toBe("完了して次へ");

    act(() => {
      button().click();
    });

    // onMutate: 楽観更新でTanStack Queryのキャッシュとlib/store/progressStore.ts
    // の両方が即座に"done"を反映する(サーバ応答を待たない)。
    await waitFor(() => {
      expect(queryClient.getQueryData<GetProgressResponse>(PROGRESS_QUERY_KEY)?.progress[0]).toMatchObject(
        { itemSlug: ITEM_SLUG, status: "done" },
      );
    });
    expect(useProgressStore.getState().bySlug[ITEM_SLUG]?.status).toBe("done");

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
    expect(button().disabled).toBe(false);
    expect(container.querySelector('[data-testid="lesson-complete-next-error"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-105 QA finding: a synchronous double-click sends only one PUT and calls onCompleted once", async () => {
    let putCount = 0;
    server.use(
      http.put("/api/progress", () => {
        putCount += 1;
        return HttpResponse.json<PutProgressResponse>({
          progress: {
            id: "server-1",
            itemType: "lesson",
            itemSlug: ITEM_SLUG,
            status: "done",
            score: null,
            completedAt: "2026-07-19T00:00:00.000Z",
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
          streak: { currentDays: 1, longestDays: 1 },
          newBadges: [],
        });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onCompleted = vi.fn();
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Host itemSlug={ITEM_SLUG} onCompleted={onCompleted} />
        </QueryClientProvider>,
      );
    });

    const button = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="lesson-complete-next"]')!;

    // 2回連続でクリックを同一タスク内で発火させる(Reactの再レンダーで
    // disabledが反映されるより前に2回目のonClickが実行される想定)。
    act(() => {
      button().click();
      button().click();
    });

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
    // 2回目のクリックはProgressMutationInFlightErrorで静かに無視され、
    // サーバへは1リクエストしか届かない(dispatchの同期ガードによる直列化)。
    expect(putCount).toBe(1);
    expect(container.querySelector('[data-testid="lesson-complete-next-error"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("rolls back the optimistic update and shows an error when the PUT fails, without calling onCompleted", async () => {
    server.use(
      http.put("/api/progress", () =>
        HttpResponse.json(
          {
            type: "about:blank#slug-unknown",
            title: "slug_unknown",
            status: 409,
          },
          { status: 409 },
        ),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const previousData: GetProgressResponse = {
      progress: [
        {
          id: "existing-1",
          itemType: "lesson",
          itemSlug: ITEM_SLUG,
          status: "in_progress",
          score: null,
          completedAt: null,
          updatedAt: "2026-07-18T00:00:00.000Z",
        },
      ],
    };
    queryClient.setQueryData(PROGRESS_QUERY_KEY, previousData);
    useProgressStore.getState().setAll(previousData.progress);

    const onCompleted = vi.fn();
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Host itemSlug={ITEM_SLUG} onCompleted={onCompleted} />
        </QueryClientProvider>,
      );
    });

    const button = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="lesson-complete-next"]')!;

    act(() => {
      button().click();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="lesson-complete-next-error"]')).not.toBeNull();
    });

    expect(onCompleted).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe("完了して次へ");
    expect(
      container.querySelector('[data-testid="lesson-complete-next-error"]')!.textContent,
    ).toBe("進捗の保存に失敗しました。もう一度お試しください。");

    // ロールバック: 楽観更新前("in_progress")の状態にキャッシュ・ストアの両方が戻る
    expect(
      queryClient.getQueryData<GetProgressResponse>(PROGRESS_QUERY_KEY)?.progress[0],
    ).toMatchObject({ itemSlug: ITEM_SLUG, status: "in_progress" });
    expect(useProgressStore.getState().bySlug[ITEM_SLUG]?.status).toBe("in_progress");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-113: when unauthenticated, records to localStorage instead of calling PUT and still calls onCompleted", async () => {
    let putCount = 0;
    server.use(
      http.put("/api/progress", () => {
        putCount += 1;
        return HttpResponse.json<PutProgressResponse>({
          progress: {
            id: "server-1",
            itemType: "lesson",
            itemSlug: ITEM_SLUG,
            status: "done",
            score: null,
            completedAt: "2026-07-19T00:00:00.000Z",
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
          streak: { currentDays: 1, longestDays: 1 },
          newBadges: [],
        });
      }),
    );

    window.localStorage.removeItem(GUEST_PROGRESS_STORAGE_KEY);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onCompleted = vi.fn();
    const onGuestComplete = vi.fn(() => {
      window.localStorage.setItem(
        GUEST_PROGRESS_STORAGE_KEY,
        JSON.stringify([{ itemType: "lesson", itemSlug: ITEM_SLUG, status: "done" }]),
      );
    });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Host
            itemSlug={ITEM_SLUG}
            onCompleted={onCompleted}
            isAuthenticated={false}
            onGuestComplete={onGuestComplete}
          />
        </QueryClientProvider>,
      );
    });

    const button = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="lesson-complete-next"]')!;

    act(() => {
      button().click();
    });

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
    expect(onGuestComplete).toHaveBeenCalledTimes(1);
    expect(putCount).toBe(0);
    expect(readGuestProgress()).toEqual([
      { itemType: "lesson", itemSlug: ITEM_SLUG, status: "done" },
    ]);
    expect(container.querySelector('[data-testid="lesson-complete-next-error"]')).toBeNull();

    window.localStorage.removeItem(GUEST_PROGRESS_STORAGE_KEY);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
