// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SettingsWithData } from "@/components/settings/SettingsWithData";
import type { AccountRecord } from "@/lib/settings/schemas";

/**
 * S-10設定画面(T-308)の描画テスト。DashboardWithData.test.tsx(T-112)と同じ
 * msw(GET/PATCH/DELETE /api/account)モックパターンで、GET結果の反映・
 * PATCH成功時の保存フィードバック・削除フロー(タイプ確認式ゲート・
 * signOut呼び出し)を検証する。
 *
 * useRouterはNext.jsのApp Routerコンテキストへのマウントを要求し
 * (tests/unit/lesson/LessonLayout.test.tsxと同じ既知の制約)、単純な
 * createRoot描画パスには存在しないためモックする。
 */
vi.mock("@/lib/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/i18n/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn() }) };
});

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ACCOUNT: AccountRecord = {
  id: "user-1",
  email: "learner@example.com",
  displayName: "Learner One",
  localePref: "ja",
  themePref: "system",
};

const server = setupServer(http.get("/api/account", () => HttpResponse.json({ account: ACCOUNT })));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  signOutMock.mockClear();
});
afterAll(() => server.close());

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

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

function renderSettings(container: HTMLDivElement, root: Root) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ja" messages={{}}>
          <SettingsWithData locale="ja" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
}

describe("SettingsWithData (T-308 msw integration)", () => {
  it("shows a loading state before GET /api/account resolves, then renders the fetched profile", async () => {
    const { container, root } = mountContainer();

    await renderSettings(container, root);
    expect(container.querySelector('[data-testid="settings-loading"]')).not.toBeNull();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-display-name-input"]')).not.toBeNull();
    });
    expect(
      (container.querySelector('[data-testid="settings-display-name-input"]') as HTMLInputElement).value,
    ).toBe("Learner One");
    expect((container.querySelector('[data-testid="settings-locale-pref-select"]') as HTMLSelectElement).value).toBe(
      "ja",
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it("shows an error state instead of an empty form when GET /api/account fails", async () => {
    server.use(http.get("/api/account", () => HttpResponse.json({ title: "internal_error" }, { status: 500 })));
    const { container, root } = mountContainer();

    await renderSettings(container, root);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-error"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="settings-profile-form"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("saves the profile display name via PATCH /api/account and shows a success message", async () => {
    let receivedBody: unknown;
    server.use(
      http.patch("/api/account", async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ account: { ...ACCOUNT, displayName: "New Name" } });
      }),
    );
    const { container, root } = mountContainer();
    await renderSettings(container, root);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-profile-form"]')).not.toBeNull();
    });

    const input = container.querySelector('[data-testid="settings-display-name-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "New Name");
    });
    const form = container.querySelector('[data-testid="settings-profile-form"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-profile-saved"]')).not.toBeNull();
    });
    expect(receivedBody).toEqual({ displayName: "New Name" });

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the delete confirm button disabled until the typed email matches the account email", async () => {
    const { container, root } = mountContainer();
    await renderSettings(container, root);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-delete-open"]')).not.toBeNull();
    });

    const openButton = container.querySelector('[data-testid="settings-delete-open"]') as HTMLButtonElement;
    await act(async () => openButton.click());

    const confirmButton = container.querySelector('[data-testid="settings-delete-confirm"]') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const confirmInput = container.querySelector('[data-testid="settings-delete-confirm-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(confirmInput, "not-the-email");
    });
    expect(confirmButton.disabled).toBe(true);

    await act(async () => {
      setInputValue(confirmInput, ACCOUNT.email);
    });
    expect(confirmButton.disabled).toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });

  it("deletes the account, signs out, and surfaces a mismatch error from the server on 400", async () => {
    server.use(
      http.delete("/api/account", () =>
        HttpResponse.json({ title: "validation_error", status: 400 }, { status: 400 }),
      ),
    );
    const { container, root } = mountContainer();
    await renderSettings(container, root);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-delete-open"]')).not.toBeNull();
    });

    await act(async () => {
      (container.querySelector('[data-testid="settings-delete-open"]') as HTMLButtonElement).click();
    });
    const confirmInput = container.querySelector('[data-testid="settings-delete-confirm-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(confirmInput, ACCOUNT.email);
    });
    const dialogForm = container.querySelector('[data-testid="settings-delete-dialog"] form') as HTMLFormElement;
    await act(async () => {
      dialogForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-delete-error"]')).not.toBeNull();
    });
    expect(signOutMock).not.toHaveBeenCalled();

    server.use(http.delete("/api/account", () => HttpResponse.json({ status: "ok" })));
    await act(async () => {
      dialogForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    });

    await act(async () => root.unmount());
    container.remove();
  });

  it("focuses the confirm input on open and disables cancel while the delete request is in flight", async () => {
    let resolveDelete: (() => void) | undefined;
    server.use(
      http.delete(
        "/api/account",
        () =>
          new Promise<Response>((resolve) => {
            resolveDelete = () => resolve(HttpResponse.json({ status: "ok" }));
          }),
      ),
    );
    const { container, root } = mountContainer();
    await renderSettings(container, root);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="settings-delete-open"]')).not.toBeNull();
    });

    await act(async () => {
      (container.querySelector('[data-testid="settings-delete-open"]') as HTMLButtonElement).click();
    });
    const confirmInput = container.querySelector('[data-testid="settings-delete-confirm-input"]') as HTMLInputElement;
    // qa-evaluator指摘対応: 開いた瞬間に確認入力へフォーカスが移ること(破壊的操作の
    // ダイアログとしてキーボード操作だけで完結する必要がある)。
    expect(document.activeElement).toBe(confirmInput);

    await act(async () => {
      setInputValue(confirmInput, ACCOUNT.email);
    });
    const dialogForm = container.querySelector('[data-testid="settings-delete-dialog"] form') as HTMLFormElement;
    await act(async () => {
      dialogForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // qa-evaluator指摘対応: 送信中は「キャンセル」を無効化する(押しても進行中の
    // DELETEは中断されないため、押せてしまうと「キャンセルしたのに削除された」
    // という欺瞞的な体験になる)。
    const cancelButton = container.querySelector('[data-testid="settings-delete-cancel"]') as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);

    await act(async () => {
      resolveDelete?.();
    });
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
