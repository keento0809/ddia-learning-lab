// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RaftViz } from "@/components/viz/RaftViz";
import { VIZ_REGISTRY } from "@/components/viz/registry";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { CLUSTER_SIZE } from "@/components/viz/raft/engine";

/**
 * T-207共通受入(03「共通受入」)「describeState両言語実装/キーボード操作可能/
 * <Viz name>経由でMDXから遅延ロードされること」のコンポーネント検証。
 * リポジトリの慣習(@testing-library/reactは導入せず、react-dom/client+actで
 * 実DOM操作を検証する、tests/unit/viz/Timeline.test.tsx参照)に合わせる。
 * 実ブラウザでのポインタドラッグ・スクリーンリーダー読み上げの最終確認は
 * verify-webappスキルに委ねる。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe("VIZ_REGISTRY", () => {
  it("registers RaftViz under the 'raft' name (for <Viz name='raft'> lazy loading)", () => {
    expect(VIZ_REGISTRY.raft).toBe(RaftViz);
  });
});

describe("RaftViz", () => {
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

  function node(id: number): SVGGElement {
    return container.querySelector<SVGGElement>(`[data-testid="raft-node-${id}"]`)!;
  }
  function byTestId<T extends Element = Element>(testId: string): T {
    return container.querySelector<T>(`[data-testid="${testId}"]`)!;
  }

  it("renders 5 nodes and the shared Timeline/A11yNarrator core widgets", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });

    for (let id = 0; id < CLUSTER_SIZE; id++) {
      expect(node(id)).not.toBeNull();
      expect(node(id).getAttribute("data-role")).toBe("follower");
    }
    expect(byTestId("viz-timeline")).not.toBeNull();
    expect(byTestId("viz-a11y-narrator")).not.toBeNull();
    expect(byTestId("raft-partition-divider")).not.toBeNull();
  });

  it("toggles a node between follower and stopped via click, and it is keyboard-operable via Enter", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });

    act(() => {
      node(0).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(node(0).getAttribute("data-role")).toBe("stopped");

    act(() => {
      node(0).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(node(0).getAttribute("data-role")).toBe("follower");
  });

  it("moves the partition divider via the ArrowRight/ArrowLeft keys and updates the status text", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });

    const divider = byTestId("raft-partition-divider");
    expect(divider.getAttribute("aria-valuenow")).toBe("0");

    act(() => {
      divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    act(() => {
      divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(divider.getAttribute("aria-valuenow")).toBe("2");
    expect(byTestId("raft-partition-status").textContent).not.toHaveLength(0);

    act(() => {
      divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(divider.getAttribute("aria-valuenow")).toBe("1");
  });

  it("advances election timers when the Timeline step button is clicked", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });

    // 初期状態(全ノードfollower)ではタイマーの残りtickはaria-labelに含まれない
    // (term/role/idのみ)ため、SVGのタイマーリング(<circle stroke-dashoffset>)を
    // 直接読み、1ステップで実際に残りtickが減っていることを検証する
    // (デフォルトシードの場合、最小タイムアウトは3tickのため1ステップでは
    // どのノードも選挙タイムアウトに到達しないことをengine.tsのadvance()から
    // 確認済み)。
    const ring = () => node(0).querySelector("circle[stroke-dasharray]");
    const offsetBefore = ring()!.getAttribute("stroke-dashoffset");

    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });

    expect(ring()!.getAttribute("stroke-dashoffset")).not.toBe(offsetBefore);
    for (let id = 0; id < CLUSTER_SIZE; id++) {
      expect(node(id)).not.toBeNull();
    }
  });

  it("supports quiz mode: toggling nodes and submitting gives correct/incorrect feedback", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });

    act(() => {
      byTestId<HTMLButtonElement>("raft-quiz-toggle").click();
    });
    expect(byTestId("raft-quiz-panel")).not.toBeNull();

    // 5台中2台を停止し、生存数をクォーラム(3)に一致させる
    act(() => {
      node(0).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      node(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      byTestId<HTMLButtonElement>("raft-quiz-submit").click();
    });

    expect(byTestId("raft-quiz-feedback")).not.toBeNull();
  });

  it("renders describeState narration text that differs between ja and en", async () => {
    const { container: jaContainer, root: jaRoot } = mountContainer();
    await act(async () => {
      jaRoot.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });
    const jaText = jaContainer.querySelector('[data-testid="viz-a11y-narrator"]')!.textContent;

    const { container: enContainer, root: enRoot } = mountContainer();
    await act(async () => {
      enRoot.render(
        <LessonLocaleProvider locale="en">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });
    const enText = enContainer.querySelector('[data-testid="viz-a11y-narrator"]')!.textContent;

    expect(jaText).not.toBe(enText);
    expect(jaText).not.toHaveLength(0);
    expect(enText).not.toHaveLength(0);

    await act(async () => {
      jaRoot.unmount();
      enRoot.unmount();
    });
    jaContainer.remove();
    enContainer.remove();
  });

  it("marks the propose button inert (aria-disabled, not native disabled) when there is no leader yet, and clicking it is a no-op", async () => {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <RaftViz />
        </LessonLocaleProvider>,
      );
    });
    const proposeButton = byTestId<HTMLButtonElement>("raft-propose");
    // ネイティブdisabledはフォーカス中の要素に付与されるとbodyへフォーカスが
    // 強制的に落ちキーボード操作の連続動線を壊す(.claude/skills/viz-component/
    // references/pitfalls.md §1)ため、aria-disabled + ハンドラ側ガード節を使う。
    expect(proposeButton.hasAttribute("disabled")).toBe(false);
    expect(proposeButton.getAttribute("aria-disabled")).toBe("true");

    const nodesTextBefore = Array.from({ length: CLUSTER_SIZE }, (_, id) => node(id).textContent);
    act(() => {
      proposeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const nodesTextAfter = Array.from({ length: CLUSTER_SIZE }, (_, id) => node(id).textContent);
    expect(nodesTextAfter).toEqual(nodesTextBefore);
  });
});
