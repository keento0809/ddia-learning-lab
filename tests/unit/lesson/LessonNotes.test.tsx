// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonNotes } from "@/components/lesson/LessonNotes";
import type { GetNoteResponse } from "@/lib/contracts";

/**
 * T-307受入基準「2s debounce自動保存(PUT /api/notes/{lessonSlug})」の
 * コンポーネントレベル検証(msw + フェイクタイマー)。debounceトリガー自体の
 * 決定的な単体テストはtests/unit/lab/debouncedSaver.test.ts(共有実装
 * lib/lab/debouncedSaver.tsをlib/notes/でも再利用)で網羅済みのため、ここでは
 * 「入力→2000ms後に正しいbodyMdでPUTが1回だけ送られる」統合的な結線のみを見る。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const LESSON_SLUG = "01-reliability/01-intro";

let putCalls: string[] = [];
let getCount = 0;

const server = setupServer(
  http.get(`/api/notes/${LESSON_SLUG}`, () => {
    getCount += 1;
    return HttpResponse.json<GetNoteResponse>({ note: null });
  }),
  http.put(`/api/notes/${LESSON_SLUG}`, async ({ request }) => {
    const body = (await request.json()) as { bodyMd: string };
    putCalls.push(body.bodyMd);
    return HttpResponse.json<GetNoteResponse>({
      note: { lessonSlug: LESSON_SLUG, bodyMd: body.bodyMd, updatedAt: "2026-07-19T00:00:00.000Z" },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  putCalls = [];
  getCount = 0;
});
afterAll(() => server.close());

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

/**
 * 未ログイン時の分岐が`@/lib/i18n/navigation`の`Link`(next-intl)を描画するため、
 * tests/unit/lesson/LessonLayout.test.tsxと同様にNextIntlClientProviderで包む。
 */
function withProviders(queryClient: QueryClient, children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ja" messages={{}}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flushFakeTimers(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function waitForCondition(check: () => boolean, maxTicks = 30): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    if (check()) return;
    await flushFakeTimers(0);
  }
  throw new Error("condition not met within timeout");
}

/**
 * `next/dynamic({ssr:false})`の実際のchunkロード(NotePreview、marked+dompurify)は
 * フェイクタイマーでは進まない内部スケジューリングに依存するため、実タイマーで
 * ポーリングする(このテストの他のフェイクタイマー依存箇所とは独立)。
 */
async function waitForConditionReal(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("condition not met within timeout");
}

describe("LessonNotes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves via PUT 2s after the user stops typing, and sends nothing before that", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        withProviders(
          queryClient,
          <LessonNotes locale="ja" lessonSlug={LESSON_SLUG} isAuthenticated={true} />,
        ),
      );
    });

    const textarea = () =>
      container.querySelector<HTMLTextAreaElement>('[data-testid="lesson-notes-textarea"]')!;
    await waitForCondition(() => textarea().disabled === false);

    await act(async () => {
      setTextareaValue(textarea(), "学習メモ");
    });

    await flushFakeTimers(1999);
    expect(putCalls).toHaveLength(0);

    await flushFakeTimers(1);
    expect(putCalls).toEqual(["学習メモ"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("resets the debounce timer on each keystroke, saving only the final value once", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        withProviders(
          queryClient,
          <LessonNotes locale="ja" lessonSlug={LESSON_SLUG} isAuthenticated={true} />,
        ),
      );
    });

    const textarea = () =>
      container.querySelector<HTMLTextAreaElement>('[data-testid="lesson-notes-textarea"]')!;
    await waitForCondition(() => textarea().disabled === false);

    await act(async () => {
      setTextareaValue(textarea(), "第一稿");
    });
    await flushFakeTimers(1500);

    await act(async () => {
      setTextareaValue(textarea(), "最終稿");
    });
    await flushFakeTimers(1500);
    expect(putCalls).toHaveLength(0);

    await flushFakeTimers(500);
    expect(putCalls).toEqual(["最終稿"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("flushes a pending save immediately on unmount instead of discarding it (qa-evaluator T-307 finding: lesson navigation within the 2s window)", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        withProviders(
          queryClient,
          <LessonNotes locale="ja" lessonSlug={LESSON_SLUG} isAuthenticated={true} />,
        ),
      );
    });

    const textarea = () =>
      container.querySelector<HTMLTextAreaElement>('[data-testid="lesson-notes-textarea"]')!;
    await waitForCondition(() => textarea().disabled === false);

    await act(async () => {
      setTextareaValue(textarea(), "移動前の下書き");
    });
    // まだdebounceの2000msに満たない時点でアンマウント(レッスン間ナビゲーション相当)。
    await flushFakeTimers(500);
    expect(putCalls).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
    await flushFakeTimers(0);

    expect(putCalls).toEqual(["移動前の下書き"]);
    container.remove();
  });

  it("renders the sanitized Markdown preview when the Preview tab is selected", async () => {
    // next/dynamic({ssr:false})の実chunkロードは実タイマー(Promise/マイクロタスク
    // スケジューリング)に依存するため、このテストのみフェイクタイマーを使わない。
    vi.useRealTimers();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        withProviders(
          queryClient,
          <LessonNotes locale="ja" lessonSlug={LESSON_SLUG} isAuthenticated={true} />,
        ),
      );
    });

    const textarea = () =>
      container.querySelector<HTMLTextAreaElement>('[data-testid="lesson-notes-textarea"]')!;
    await waitForConditionReal(() => textarea().disabled === false);

    await act(async () => {
      setTextareaValue(textarea(), '**強調** <script>alert("xss")</script>');
    });

    const previewTab = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="lesson-notes-preview-tab"]')!;
    await act(async () => {
      previewTab().click();
    });

    await waitForConditionReal(
      () => container.querySelector('[data-testid="lesson-note-preview"]') !== null,
    );
    const preview = container.querySelector('[data-testid="lesson-note-preview"]')!;
    expect(preview.innerHTML).toContain("<strong>強調</strong>");
    expect(preview.innerHTML).not.toContain("<script");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a sign-in prompt and never calls the notes API when unauthenticated", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        withProviders(
          queryClient,
          <LessonNotes locale="ja" lessonSlug={LESSON_SLUG} isAuthenticated={false} />,
        ),
      );
    });
    await flushFakeTimers(0);

    expect(container.querySelector('[data-testid="lesson-notes-signin-prompt"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lesson-notes-textarea"]')).toBeNull();
    expect(getCount).toBe(0);
    expect(putCalls).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
