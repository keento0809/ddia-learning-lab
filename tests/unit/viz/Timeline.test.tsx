// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline } from "@/components/viz/core/Timeline";
import { createSimEngine, type SimEngineDefinition } from "@/components/viz/core/simEngine";
import type { SimEngine } from "@/lib/contracts";

/**
 * T-203受入基準「ダミーVizでTimeline操作のコンポーネントテスト」。
 * このリポジトリの慣習(@testing-library/reactは導入せず、react-dom/client +
 * reactのactで実DOM操作を検証する、tests/unit/lesson/CompleteAndNextButton.test.tsx
 * 参照)に合わせる。速度スライダーの操作はReactの値トラッキング機構
 * (プロトタイプのvalueセッターを介さないと変更がReactに伝わらない)を回避する
 * ため、@testing-library/react内部と同じ「ネイティブセッター経由でvalueを設定
 * してからinputイベントを発火する」手法を使う。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface CounterState {
  count: number;
}
type NoAction = never;

const dummyDefinition: SimEngineDefinition<CounterState, NoAction> = {
  createInitialState: () => ({ count: 0 }),
  applyAction: (state) => state,
  advance: (state) => ({ count: state.count + 1 }),
};

function DummyViz({ engine }: { engine: SimEngine<CounterState, NoAction> }) {
  const [state, setState] = useState(engine.getState());
  useEffect(() => engine.subscribe(setState), [engine]);

  return (
    <div>
      <p data-testid="dummy-viz-count">{state.count}</p>
      <Timeline locale="ja" onStep={() => engine.step()} onReset={() => engine.reset()} />
    </div>
  );
}

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

describe("Timeline (dummy Viz component test)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let engine: SimEngine<CounterState, NoAction>;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = createSimEngine(dummyDefinition, { seed: 1 });
    ({ container, root } = mountContainer());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function count(): number {
    return Number(container.querySelector('[data-testid="dummy-viz-count"]')!.textContent);
  }
  function button(testId: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;
  }

  it("advances the engine on each interval tick while playing, and stops on pause", async () => {
    await act(async () => {
      root.render(<DummyViz engine={engine} />);
    });

    expect(count()).toBe(0);
    expect(button("viz-timeline-play").disabled).toBe(false);
    expect(button("viz-timeline-pause").disabled).toBe(true);

    act(() => {
      button("viz-timeline-play").click();
    });
    expect(button("viz-timeline-play").disabled).toBe(true);
    expect(button("viz-timeline-pause").disabled).toBe(false);

    // 既定間隔は速度1倍で1000ms。1000ms経過ごとに1ステップ進む。
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(count()).toBe(3);

    act(() => {
      button("viz-timeline-pause").click();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // 一時停止後はタイマーが進んでもステップは増えない。
    expect(count()).toBe(3);
  });

  it("advances the engine once per click via the step button while paused", async () => {
    await act(async () => {
      root.render(<DummyViz engine={engine} />);
    });

    act(() => {
      button("viz-timeline-step").click();
    });
    expect(count()).toBe(1);

    act(() => {
      button("viz-timeline-step").click();
      button("viz-timeline-step").click();
    });
    expect(count()).toBe(3);
  });

  it("disables the step button while playing", async () => {
    await act(async () => {
      root.render(<DummyViz engine={engine} />);
    });

    act(() => {
      button("viz-timeline-play").click();
    });
    expect(button("viz-timeline-step").disabled).toBe(true);
  });

  it("changes tick cadence when speed changes (0.5x-4x range)", async () => {
    await act(async () => {
      root.render(<DummyViz engine={engine} />);
    });

    const speedInput = container.querySelector<HTMLInputElement>('[data-testid="viz-timeline-speed"]')!;
    expect(speedInput.min).toBe("0.5");
    expect(speedInput.max).toBe("4");

    act(() => {
      setRangeValue(speedInput, "4");
    });
    act(() => {
      button("viz-timeline-play").click();
    });

    // 速度4倍では間隔は1000/4=250ms。
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(count()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(count()).toBe(2);
  });

  it("resets the engine state and stops playback via the reset button", async () => {
    await act(async () => {
      root.render(<DummyViz engine={engine} />);
    });

    act(() => {
      button("viz-timeline-play").click();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(count()).toBe(2);

    act(() => {
      button("viz-timeline-reset").click();
    });
    expect(count()).toBe(0);
    expect(button("viz-timeline-play").disabled).toBe(false);
    expect(button("viz-timeline-pause").disabled).toBe(true);

    // リセット後は再生も止まっているため、タイマーが進んでも増えない。
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(count()).toBe(0);
  });
});
