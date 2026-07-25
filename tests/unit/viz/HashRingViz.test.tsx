// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HashRingViz } from "@/components/viz/HashRingViz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { BULK_KEY_COUNT, MAX_VNODES, MIN_VNODES } from "@/components/viz/hashRingEngine";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * T-205 HashRingVizのコンポーネントテスト。このリポジトリの慣習
 * (@testing-library/reactは導入せず、react-dom/client + reactのactで実DOM操作を
 * 検証する、tests/unit/viz/Timeline.test.tsx参照)に合わせる。
 * 受入基準: ノード追加/削除・vnodesスライダー(1–300)・キー1000個一括投入が
 * 動作すること、指標パネルが表示されること(02§8.2)。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

function setRangeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("HashRingViz", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mountContainer());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function el<T extends Element = Element>(testId: string): T {
    return container.querySelector<T>(`[data-testid="${testId}"]`)!;
  }
  function all(testId: string): NodeListOf<Element> {
    return container.querySelectorAll(`[data-testid="${testId}"]`);
  }

  async function renderViz(locale: Locale = "ja") {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale={locale}>
          <HashRingViz />
        </LessonLocaleProvider>,
      );
    });
  }

  it("shows the empty-state note and disables node removal when there are no nodes", async () => {
    await renderViz();

    expect(el("hash-ring-no-nodes-note")).toBeTruthy();
    expect(el<HTMLButtonElement>("hash-ring-remove-node").disabled).toBe(true);
    expect(el<HTMLSelectElement>("hash-ring-remove-node-select").disabled).toBe(true);
  });

  it("adds a node on click, rendering its vnode ticks and updating the stats panel", async () => {
    await renderViz();

    act(() => {
      el<HTMLButtonElement>("hash-ring-add-node").click();
    });

    expect(all("hash-ring-node-group")).toHaveLength(1);
    expect(el("hash-ring-stat-node-count").textContent).toContain("1");
    expect(el<HTMLButtonElement>("hash-ring-remove-node").disabled).toBe(false);
  });

  it("removes the selected node and reassigns the remaining ones", async () => {
    await renderViz();
    act(() => {
      el<HTMLButtonElement>("hash-ring-add-node").click();
      el<HTMLButtonElement>("hash-ring-add-node").click();
    });
    expect(all("hash-ring-node-group")).toHaveLength(2);

    const select = el<HTMLSelectElement>("hash-ring-remove-node-select");
    expect(select.value).toBe("node-1");

    act(() => {
      el<HTMLButtonElement>("hash-ring-remove-node").click();
    });

    expect(all("hash-ring-node-group")).toHaveLength(1);
    expect(el("hash-ring-stat-node-count").textContent).toContain("1");
  });

  it("changes the vnodes-per-node count via the slider (range 1-300)", async () => {
    await renderViz();
    act(() => {
      el<HTMLButtonElement>("hash-ring-add-node").click();
    });

    const slider = el<HTMLInputElement>("hash-ring-vnodes-slider");
    expect(slider.min).toBe(String(MIN_VNODES));
    expect(slider.max).toBe(String(MAX_VNODES));

    act(() => {
      setRangeValue(slider, "10");
    });

    expect(all("hash-ring-node-group")[0].querySelectorAll("circle")).toHaveLength(10);
  });

  it("bulk-inserts BULK_KEY_COUNT keys and updates the metrics panel", async () => {
    await renderViz();
    act(() => {
      el<HTMLButtonElement>("hash-ring-add-node").click();
      el<HTMLButtonElement>("hash-ring-add-node").click();
    });

    act(() => {
      el<HTMLButtonElement>("hash-ring-add-keys").click();
    });

    expect(el("hash-ring-stat-key-count").textContent).toContain(String(BULK_KEY_COUNT));
  });

  it("uses native, keyboard-operable form controls for every action", async () => {
    await renderViz();
    act(() => {
      el<HTMLButtonElement>("hash-ring-add-node").click();
    });

    expect(el("hash-ring-add-node").tagName).toBe("BUTTON");
    expect(el("hash-ring-remove-node").tagName).toBe("BUTTON");
    expect(el("hash-ring-remove-node-select").tagName).toBe("SELECT");
    expect(el("hash-ring-vnodes-slider").tagName).toBe("INPUT");
    expect(el<HTMLInputElement>("hash-ring-vnodes-slider").type).toBe("range");
    expect(el("hash-ring-add-keys").tagName).toBe("BUTTON");
  });

  it("renders the locale-specific heading and stays consistent between ja and en", async () => {
    await renderViz("en");
    expect(el("hash-ring-viz").textContent).toContain(getMessages("en").hashRingViz.heading);

    await act(async () => {
      root.unmount();
    });
    ({ container, root } = mountContainer());
    await renderViz("ja");
    expect(el("hash-ring-viz").textContent).toContain(getMessages("ja").hashRingViz.heading);
  });

  it("renders the A11yNarrator status region", async () => {
    await renderViz();
    expect(container.querySelector('[data-testid="viz-a11y-narrator"]')).toBeTruthy();
  });
});
