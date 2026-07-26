// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GlossaryPage } from "@/components/glossary/GlossaryPage";
import type { GlossaryEntry } from "@/lib/glossaryContent";

// Reactの公式act()環境フラグ(tests/unit/lesson/CompleteAndNextButton.test.tsxと同じ理由)。
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

/**
 * Reactは制御コンポーネントのvalueトラッキングをネイティブsetterのラップで
 * 行っているため、input.value = "..." で直接代入すると変更が検知されず
 * onChangeが発火しない。ネイティブsetterを直接呼び出して回避する
 * (React公式の既知の制約、CompleteAndNextButton.test.tsxのclick()と異なり
 * text入力ではこの手順が必要)。
 */
function typeIntoInput(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
    .set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const ENTRIES: GlossaryEntry[] = [
  {
    slug: "latency",
    term: { ja: "レイテンシ", en: "latency" },
    definition: {
      ja: "リクエストからレスポンスまでの所要時間(テスト用フィクスチャ)。",
      en: "The time elapsed between a request and its response (test fixture only).",
    },
  },
  {
    slug: "throughput",
    term: { ja: "スループット", en: "throughput" },
    definition: {
      ja: "単位時間あたりに処理できる件数(テスト用フィクスチャ)。",
      en: "The number of operations processed per unit of time (test fixture only).",
    },
  },
];

describe("GlossaryPage (T-305)", () => {
  it("renders every entry with the current-locale term/definition and the other-locale term name", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(<GlossaryPage locale="ja" entries={ENTRIES} />);
    });

    expect(container.querySelector('[data-testid="glossary-entry-latency"]')!.textContent).toContain(
      "レイテンシ",
    );
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')!.textContent).toContain(
      "リクエストからレスポンスまでの所要時間(テスト用フィクスチャ)。",
    );
    // もう一方の言語(en)の用語名が併記される
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')!.textContent).toContain(
      "latency",
    );
    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("filters entries as the user types in the search box, and shows an empty state for no matches", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(<GlossaryPage locale="ja" entries={ENTRIES} />);
    });

    const input = container.querySelector<HTMLInputElement>('[data-testid="glossary-search-input"]')!;

    act(() => {
      typeIntoInput(input, "スループット");
    });

    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')).toBeNull();

    act(() => {
      typeIntoInput(input, "存在しない単語xyz");
    });

    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).toBeNull();
    expect(container.querySelector('[data-testid="glossary-empty-state"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("also matches the other-locale term name (e.g. searching the English word while viewing ja)", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(<GlossaryPage locale="ja" entries={ENTRIES} />);
    });

    const input = container.querySelector<HTMLInputElement>('[data-testid="glossary-search-input"]')!;

    act(() => {
      typeIntoInput(input, "throughput");
    });

    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-305 qa-evaluator finding: does not filter down while an IME composition is in progress", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(<GlossaryPage locale="ja" entries={ENTRIES} />);
    });

    const input = container.querySelector<HTMLInputElement>('[data-testid="glossary-search-input"]')!;

    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      // 変換確定前のローマ字断片("すl" 相当の未確定文字列)を模したinputイベント。
      typeIntoInput(input, "す");
    });
    // IME確定前は全件表示のまま(空状態へ明滅しない)。
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="glossary-empty-state"]')).toBeNull();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!;
      nativeSetter.call(input, "スループット");
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    // IME確定後は通常どおりフィルタが適用される。
    expect(container.querySelector('[data-testid="glossary-entry-throughput"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="glossary-entry-latency"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
