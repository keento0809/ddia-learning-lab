// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SearchPage } from "@/components/search/SearchPage";
import { addSearchDocument, createSearchIndex, exportSearchIndex } from "@/lib/search/flexIndex";

/**
 * SearchPage(T-306)のコンポーネントテスト。ビルド時生成物
 * (lib/generated/search-index.{locale}.json)への動的importをモックし、
 * 実際のFlexSearchエクスポート形式(lib/search/flexIndex.tsの
 * createSearchIndex/addSearchDocument/exportSearchIndexそのもの)で
 * 小さなインデックスを用意する(モックデータの形式が本番生成物と食い違わない
 * ようにするため、手書きのJSONではなく実関数で生成する)。
 *
 * qa-evaluator実機検証で発見した「言語トグルで検索クエリ・結果が消える」バグの
 * 修正(sessionStorage退避・復元)は、GlossaryPage(T-305)と異なりSearchPage
 * 自体に単体テストが無く自動検知できなかった(test-integrity-reviewer指摘)。
 * このファイルはその回帰防止を主目的とする。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@/lib/generated/search-index.ja.json", () => {
  const index = createSearchIndex("ja");
  addSearchDocument(index, "ja", {
    id: "lesson:a",
    kind: "lesson",
    title: "信頼性の基礎",
    body: "分散データシステムを設計するときは信頼性が重要である",
    excerpt: "分散データシステムを設計するときは信頼性が重要である",
    href: "/learn/a",
  });
  return { default: exportSearchIndex(index) };
});

vi.mock("@/lib/generated/search-index.en.json", () => {
  const index = createSearchIndex("en");
  addSearchDocument(index, "en", {
    id: "lesson:a",
    kind: "lesson",
    title: "Reliability Basics",
    body: "When designing a distributed data system, reliability matters a lot",
    excerpt: "When designing a distributed data system, reliability matters a lot",
    href: "/learn/a",
  });
  return { default: exportSearchIndex(index) };
});

const SESSION_STORAGE_KEY = "ddia-search-last-query";

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

/** SearchPageは@/lib/i18n/navigationのLinkを使うため、next-intlのコンテキストが必要。 */
async function renderSearchPage(
  root: Root,
  props: { locale: "ja" | "en"; initialQuery: string },
): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={props.locale} messages={{}}>
        <SearchPage locale={props.locale} initialQuery={props.initialQuery} />
      </NextIntlClientProvider>,
    );
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
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
}

function typeIntoInput(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
    .set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SearchPage (T-306)", () => {
  it("shows the prompt once the index is ready, then results as the user types, then an empty state for a non-matching query", async () => {
    const { container, root } = mountContainer();

    await renderSearchPage(root, { locale: "ja", initialQuery: "" });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-prompt"]')).not.toBeNull();
    });

    const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
    act(() => {
      typeIntoInput(input, "信頼性");
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-result-lesson:a"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="search-result-lesson:a"]')!.textContent).toContain(
      "信頼性の基礎",
    );

    act(() => {
      typeIntoInput(input, "存在しないキーワードxyz");
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-empty-state"]')).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("回帰防止(qa-evaluator実機検証で発見): 言語トグルでの再マウント後もsessionStorageから検索語を復元し結果を再表示する", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "信頼性");
    const { container, root } = mountContainer();

    // URLの?q=が空(=LocaleToggleがクエリ文字列を引き継がずに遷移した状態)を模す。
    await renderSearchPage(root, { locale: "ja", initialQuery: "" });

    await waitFor(() => {
      const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
      expect(input.value).toBe("信頼性");
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-result-lesson:a"]')).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it("URLに?q=が明示されている場合はsessionStorageより優先する", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "存在しないキーワードxyz");
    const { container, root } = mountContainer();

    await renderSearchPage(root, { locale: "ja", initialQuery: "信頼性" });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-result-lesson:a"]')).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it("入力するたびにsessionStorageへ検索語を書き込み、空にすると削除する", async () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    const { container, root } = mountContainer();

    await renderSearchPage(root, { locale: "ja", initialQuery: "" });
    await waitFor(() => expect(container.querySelector('[data-testid="search-prompt"]')).not.toBeNull());

    const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
    act(() => {
      typeIntoInput(input, "信頼性");
    });
    await waitFor(() => {
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe("信頼性");
    });

    act(() => {
      typeIntoInput(input, "");
    });
    await waitFor(() => {
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("IME変換中はフィルタを更新せず、確定後に反映する(GlossaryPage T-305と同じ方針)", async () => {
    const { container, root } = mountContainer();

    await renderSearchPage(root, { locale: "ja", initialQuery: "" });
    await waitFor(() => expect(container.querySelector('[data-testid="search-prompt"]')).not.toBeNull());

    const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      typeIntoInput(input, "し");
    });
    // 変換中は未確定の断片で検索が走らない(promptのまま)。
    expect(container.querySelector('[data-testid="search-prompt"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="search-empty-state"]')).toBeNull();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!;
      nativeSetter.call(input, "信頼性");
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-result-lesson:a"]')).not.toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
