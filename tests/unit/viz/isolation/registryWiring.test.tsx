// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VizBoundary } from "@/components/mdx/Viz";
import { VIZ_REGISTRY, resolveVizComponent } from "@/components/viz/registry";
import { IsolationViz } from "@/components/viz/isolation/IsolationViz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

/**
 * T-208受入基準「<Viz name='isolation'>経由でMDXから遅延ロードされる」。
 * components/mdx/Viz.tsx(<Viz>本体)はnext/dynamic(ssr:false)でクライアント専用に
 * ラップされているため(tests/unit/mdx/Viz.test.tsx参照)、その内側の実体である
 * VizBoundaryに対して"isolation"名で実際にIsolationVizが解決・描画されることを
 * 検証する。<Viz>自体からの配線(dynamic import経由でVizBoundaryへ到達すること)は
 * components/mdx/Viz.tsxの実装(next/dynamic(() => Promise.resolve(VizBoundary)))が
 * 保証しており、実ブラウザでの最終確認はverify-webappスキルで行う。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe("isolation Viz registry wiring", () => {
  it("is registered under the name 'isolation'", () => {
    expect(VIZ_REGISTRY["isolation"]).toBe(IsolationViz);
    expect(resolveVizComponent("isolation")).toBe(IsolationViz);
  });

  describe("<VizBoundary name='isolation'>", () => {
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

    it("renders the real IsolationViz component for the given preset", async () => {
      await act(async () => {
        root.render(
          <LessonLocaleProvider locale="en">
            <VizBoundary name="isolation" preset="phantom" />
          </LessonLocaleProvider>,
        );
      });

      expect(container.querySelector('[data-testid="isolation-viz"]')).not.toBeNull();
      const presetSelect = container.querySelector<HTMLSelectElement>(
        '[data-testid="isolation-preset-select"]',
      )!;
      expect(presetSelect.value).toBe("phantom");
    });
  });
});
