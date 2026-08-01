// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SearchPage } from "@/components/search/SearchPage";
import { addSearchDocument, createSearchIndex, exportSearchIndex } from "@/lib/search/flexIndex";

/**
 * T-604(ADR-009 §6)。`SearchPage`が`isAuthenticated={true}`のとき、既定の
 * `search-index.{locale}.json`(Gated階層のレッスン本文を含まない、
 * `tests/unit/search/SearchPage.test.tsx`のT-306既存5件が一貫して検証済み)
 * ではなく、認証済み向けの`search-index-authenticated.{locale}.json`
 * (全文を含む)を取得することを検証する。
 *
 * 意図的に`tests/unit/search/SearchPage.test.tsx`とは別ファイルにし、かつ
 * このファイルでは`search-index-authenticated.ja.json`一種類のみを
 * モックする: 同一テストファイル内で2種類目の異なる動的import指定子を
 * 初めてimportすると、jsdom環境下でその解決が固まる現象を確認したため
 * (原因はVite/Vitestの動的importキャッシュ側の競合と推測されるが未特定。
 * アプリコード自体は`npm run build`実ビルド+`npm run preview`実アクセスで
 * 正常動作を確認済み)。isAuthenticated未指定(既定false)側は既定の
 * `search-index.ja.json`一種類のみを使うT-306の既存5件がすでに継続して
 * 検証しているため、本ファイルでは認証済み側の1種類・1件のみを追加すれば
 * 「propに応じて別ファイルを取得する」という分岐の両方が揃う。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@/lib/generated/search-index-authenticated.ja.json", () => {
  const index = createSearchIndex("ja");
  addSearchDocument(index, "ja", {
    id: "lesson:a",
    kind: "lesson",
    title: "信頼性の基礎",
    body: "分散データシステムを設計するときは信頼性が重要である",
    excerpt: "分散データシステムを設計するときは信頼性が重要である",
    href: "/learn/a",
  });
  addSearchDocument(index, "ja", {
    id: "lesson:gated",
    kind: "lesson",
    title: "秘匿レッスン",
    body: "認証済みユーザーにのみ見えるはずの機密の本文テキスト",
    excerpt: "認証済みユーザーにのみ見えるはずの機密の本文テキスト",
    href: "/learn/gated",
  });
  return { default: exportSearchIndex(index) };
});

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

async function renderSearchPage(
  root: Root,
  props: { locale: "ja" | "en"; initialQuery: string; isAuthenticated?: boolean },
): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={props.locale} messages={{}}>
        <SearchPage
          locale={props.locale}
          initialQuery={props.initialQuery}
          isAuthenticated={props.isAuthenticated}
        />
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

describe("SearchPage auth-based index gating (T-604)", () => {
  it("isAuthenticated=trueでは認証済み専用インデックス(search-index-authenticated)を取得し、Gated文書も検索できる", async () => {
    const { container, root } = mountContainer();

    await renderSearchPage(root, { locale: "ja", initialQuery: "", isAuthenticated: true });
    await waitFor(() => expect(container.querySelector('[data-testid="search-prompt"]')).not.toBeNull());

    const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
    act(() => {
      typeIntoInput(input, "機密");
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="search-result-lesson:gated"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="search-result-lesson:gated"]')!.textContent).toContain(
      "秘匿レッスン",
    );

    // Free Tier相当の文書は認証済みインデックスでも従来どおり検索できる
    act(() => {
      typeIntoInput(input, "信頼性");
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
