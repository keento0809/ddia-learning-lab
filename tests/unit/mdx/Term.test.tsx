// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Term } from "@/components/mdx/Term";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

// Reactの公式act()環境フラグ(tests/unit/lesson/CompleteAndNextButton.test.tsxと同じ理由)。
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

const FIXTURE_ENTRIES: Record<string, { slug: string; term: { ja: string; en: string }; definition: { ja: string; en: string } }> = {
  latency: {
    slug: "latency",
    term: { ja: "レイテンシ", en: "latency" },
    definition: { ja: "遅延の説明(テスト用)。", en: "Latency explanation (test only)." },
  },
  throughput: {
    slug: "throughput",
    term: { ja: "スループット", en: "throughput" },
    definition: { ja: "処理件数の説明(テスト用)。", en: "Throughput explanation (test only)." },
  },
};

vi.mock("@/lib/glossary", () => ({
  getGlossaryEntry: (slug: string) => FIXTURE_ENTRIES[slug],
}));

describe("Term", () => {
  it("renders only the children (no popover trigger) when the slug is not in the glossary", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Term slug="not-in-glossary">{"読み取り書き込み"}</Term>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("読み取り書き込み");
    expect(html).not.toContain("<button");
  });

  it("renders a popover trigger button when the slug resolves in the glossary", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Term slug="latency">{"レイテンシ"}</Term>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("<button");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("レイテンシ");
  });

  it("T-305: clicking the trigger opens a popover showing the current-locale definition and the other-locale term name", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <Term slug="latency">{"レイテンシ"}</Term>
        </LessonLocaleProvider>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(container.querySelector('[data-testid="term-popover-latency"]')).toBeNull();

    act(() => {
      button.click();
    });

    const popover = container.querySelector<HTMLElement>('[data-testid="term-popover-latency"]');
    expect(popover).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // 現在言語(ja)の定義
    expect(popover!.textContent).toContain("遅延の説明(テスト用)。");
    // もう一方の言語(en)の用語名を併記(02§5.4「現在言語の定義+もう一方の言語の用語名」)
    expect(popover!.textContent).toContain("latency");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-305 qa-evaluator finding: clicking outside the popover closes it", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <p>
            <Term slug="latency">{"レイテンシ"}</Term>
          </p>
          <button type="button" data-testid="outside">
            {"outside"}
          </button>
        </LessonLocaleProvider>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button")!;
    act(() => {
      button.click();
    });
    expect(container.querySelector('[data-testid="term-popover-latency"]')).not.toBeNull();

    const outside = container.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="term-popover-latency"]')).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-305 qa-evaluator finding: pressing Escape closes the popover", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <Term slug="latency">{"レイテンシ"}</Term>
        </LessonLocaleProvider>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button")!;
    act(() => {
      button.click();
    });
    expect(container.querySelector('[data-testid="term-popover-latency"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[data-testid="term-popover-latency"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("T-305 qa-evaluator finding: opening a second <Term> popover closes the first one (mutual exclusion)", async () => {
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <Term slug="latency">{"レイテンシ"}</Term>
          <Term slug="throughput">{"スループット"}</Term>
        </LessonLocaleProvider>,
      );
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const [latencyButton, throughputButton] = [buttons[0], buttons[1]];

    act(() => {
      latencyButton.click();
    });
    expect(container.querySelector('[data-testid="term-popover-latency"]')).not.toBeNull();

    act(() => {
      throughputButton.click();
    });
    expect(container.querySelector('[data-testid="term-popover-throughput"]')).not.toBeNull();
    // 先に開いていた方は自動的に閉じる(本文に重なったまま残らない)
    expect(container.querySelector('[data-testid="term-popover-latency"]')).toBeNull();
    expect(latencyButton.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
