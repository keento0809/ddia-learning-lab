// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSimEngine } from "@/components/viz/core/simEngine";
import ReplicationLagViz, {
  MAX_NETWORK_DELAY_TICKS,
  MIN_NETWORK_DELAY_TICKS,
  describeReplicationLagState,
  replicationLagDefinition,
  type ReplicationInFlightMessage,
} from "@/components/viz/ReplicationLagViz";
import { VIZ_REGISTRY, resolveVizComponent } from "@/components/viz/registry";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

/**
 * T-206受入基準(02§8.2 ReplicationLagViz)。
 * - リーダー1+フォロワー2の非同期レプリケーションをtick単位のSimEngineで表現。
 * - 「自分の書込みが読めない」シナリオが乱数なしで決定的に再現し、対策トグル
 *   (リーダー読取り固定/バージョン待ち)で違反0になることをSimEngineレベルで検証する。
 * - 書込み/読取りリクエストのドロップが実際にレプリケーション・読み取り結果へ
 *   影響することを検証する。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("registry", () => {
  it("registers the ReplicationLagViz component under 'replication-lag'", () => {
    expect(resolveVizComponent("replication-lag")).toBe(VIZ_REGISTRY["replication-lag"]);
    expect(VIZ_REGISTRY["replication-lag"]).toBe(ReplicationLagViz);
  });
});

describe("replicationLagDefinition (SimEngine): read-your-writes scenario", () => {
  it("reproduces a read-your-writes violation deterministically when no mitigation is set", () => {
    const run = () => {
      const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
      engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" });
      engine.step();
      return engine.getState();
    };

    const first = run();
    const second = run();

    expect(first.violations).toBe(1);
    expect(first.readLog).toHaveLength(1);
    expect(first.readLog[0].violation).toBe(true);
    expect(first.readLog[0].servedTarget).toBe("follower-1");
    expect(first.readLog[0].resultVersion).toBe(0);
    expect(first.readLog[0].requiredVersion).toBe(1);
    // 決定的: 乱数を使わないため、同じ操作列は毎回同じ結果になる。
    expect(second).toEqual(first);
  });

  it("eliminates the violation when the read-from-leader mitigation is toggled on", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "SET_MITIGATION", mode: "read-from-leader" });
    engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" });
    engine.step();

    const state = engine.getState();
    expect(state.violations).toBe(0);
    expect(state.readLog).toHaveLength(1);
    expect(state.readLog[0].violation).toBe(false);
    expect(state.readLog[0].servedTarget).toBe("leader");
    expect(state.readLog[0].resultVersion).toBe(1);
  });

  it("eliminates the violation when the wait-for-version mitigation is toggled on", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "SET_MITIGATION", mode: "wait-for-version" });
    engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" });

    // 1ステップ目: 読み取りリクエストはフォロワーに到達するが、まだレプリケーション
    // が届いていないためバージョン待ちで保留(held)になる。
    engine.step();
    let state = engine.getState();
    expect(state.violations).toBe(0);
    expect(state.readLog).toHaveLength(0);
    const held = state.inFlight.find(
      (message): message is Extract<ReplicationInFlightMessage, { kind: "read-request" }> =>
        message.kind === "read-request",
    );
    expect(held?.held).toBe(true);

    // レプリケーションが到達するまでステップを進めると、保留されていた読み取りが
    // 新しいバージョンで解決し、違反は発生しない。
    engine.step();
    state = engine.getState();
    expect(state.violations).toBe(0);
    expect(state.readLog).toHaveLength(1);
    expect(state.readLog[0].violation).toBe(false);
    expect(state.readLog[0].resultVersion).toBe(1);
  });
});

describe("replicationLagDefinition (SimEngine): free-play write/read/drop", () => {
  it("drops a write-request so it never commits at the leader", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "WRITE", clientId: "you" });
    const writeMessage = engine.getState().inFlight[0];
    engine.dispatch({ type: "DROP_MESSAGE", messageId: writeMessage.id });

    engine.step();
    engine.step();
    engine.step();

    const state = engine.getState();
    expect(state.leaderVersion).toBe(0);
    expect(state.inFlight).toHaveLength(0);
    expect(state.droppedCount).toBe(1);
  });

  it("drops a replication message, keeping a follower permanently stale and causing a read violation", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "WRITE", clientId: "you" });
    engine.step();
    engine.step();
    expect(engine.getState().leaderVersion).toBe(1);

    const replicationToFollower1 = engine
      .getState()
      .inFlight.find(
        (message): message is Extract<ReplicationInFlightMessage, { kind: "replication" }> =>
          message.kind === "replication" && message.target === "follower-1",
      );
    expect(replicationToFollower1).toBeDefined();
    engine.dispatch({ type: "DROP_MESSAGE", messageId: replicationToFollower1!.id });

    // follower-2 へのレプリケーションは自然に到達させる。
    engine.step();
    engine.step();
    expect(engine.getState().followerVersions["follower-2"]).toBe(1);
    expect(engine.getState().followerVersions["follower-1"]).toBe(0);

    engine.dispatch({ type: "READ", clientId: "you", target: "follower-1" });
    engine.step();
    engine.step();

    const state = engine.getState();
    expect(state.followerVersions["follower-1"]).toBe(0);
    expect(state.violations).toBe(1);
    expect(state.readLog.at(-1)?.violation).toBe(true);
    expect(state.droppedCount).toBe(1);
  });

  it("ignores a duplicate DROP_MESSAGE dispatch for an already-dropped message id", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "WRITE", clientId: "you" });
    const writeMessage = engine.getState().inFlight[0];

    engine.dispatch({ type: "DROP_MESSAGE", messageId: writeMessage.id });
    engine.dispatch({ type: "DROP_MESSAGE", messageId: writeMessage.id });

    const state = engine.getState();
    expect(state.inFlight).toHaveLength(0);
    expect(state.droppedCount).toBe(1);
  });

  it("clamps SET_NETWORK_DELAY to the documented min/max range", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "SET_NETWORK_DELAY", ticks: 999 });
    expect(engine.getState().networkDelayTicks).toBe(MAX_NETWORK_DELAY_TICKS);
    engine.dispatch({ type: "SET_NETWORK_DELAY", ticks: -5 });
    expect(engine.getState().networkDelayTicks).toBe(MIN_NETWORK_DELAY_TICKS);
  });
});

describe("describeReplicationLagState", () => {
  it("describes state in Japanese", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" });
    engine.step();
    const text = describeReplicationLagState(engine.getState(), "ja");
    expect(text).toContain("tick1");
    expect(text).toContain("read-your-writes違反1件");
  });

  it("describes state in English", () => {
    const engine = createSimEngine(replicationLagDefinition, { seed: 1 });
    engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" });
    engine.step();
    const text = describeReplicationLagState(engine.getState(), "en");
    expect(text).toContain("tick 1");
    expect(text).toContain("1 read-your-writes violations");
  });
});

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ReplicationLagViz (component)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ container, root } = mountContainer());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function byTestId<T extends HTMLElement = HTMLElement>(testId: string): T {
    const el = container.querySelector<T>(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`missing element: ${testId}`);
    return el;
  }

  function renderViz(): void {
    root.render(
      <LessonLocaleProvider locale="ja">
        <ReplicationLagViz />
      </LessonLocaleProvider>,
    );
  }

  it("runs the read-your-writes scenario via real buttons and reports a violation without mitigation", async () => {
    await act(async () => {
      renderViz();
    });

    act(() => {
      byTestId<HTMLButtonElement>("replication-lag-scenario").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });

    expect(byTestId("replication-lag-violations").textContent).toContain("1");
  });

  it("eliminates the violation once read-from-leader mitigation is selected via the radio control", async () => {
    await act(async () => {
      renderViz();
    });

    const radio = byTestId<HTMLInputElement>("replication-lag-mitigation-read-from-leader");
    expect(radio.tagName).toBe("INPUT");
    expect(radio.type).toBe("radio");
    act(() => {
      radio.click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("replication-lag-scenario").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });

    expect(byTestId("replication-lag-violations").textContent).toContain("0");
  });

  it("drops an in-flight write-request via its drop button, removing it from the accessible list", async () => {
    await act(async () => {
      renderViz();
    });

    act(() => {
      byTestId<HTMLButtonElement>("replication-lag-write").click();
    });
    expect(container.querySelectorAll('[data-testid^="replication-lag-drop-"]')).toHaveLength(1);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid^="replication-lag-drop-"]')!.click();
    });

    expect(container.querySelectorAll('[data-testid^="replication-lag-drop-"]')).toHaveLength(0);
    expect(byTestId("replication-lag-dropped").textContent).toContain("1");
    expect(byTestId("replication-lag-inflight-empty")).toBeTruthy();
  });

  it("updates the network delay label when the slider (a real input[range]) changes", async () => {
    await act(async () => {
      renderViz();
    });

    const slider = byTestId<HTMLInputElement>("replication-lag-network-delay");
    expect(slider.tagName).toBe("INPUT");
    expect(slider.type).toBe("range");
    expect(slider.min).toBe(String(MIN_NETWORK_DELAY_TICKS));
    expect(slider.max).toBe(String(MAX_NETWORK_DELAY_TICKS));

    act(() => {
      setInputValue(slider, "5");
    });

    expect(byTestId("replication-lag-network-delay-label").textContent).toContain("5");
  });

  it("performs a manual write and read using real buttons and a select control", async () => {
    await act(async () => {
      renderViz();
    });

    act(() => {
      byTestId<HTMLButtonElement>("replication-lag-write").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });

    const select = byTestId<HTMLSelectElement>("replication-lag-read-target");
    expect(select.tagName).toBe("SELECT");

    act(() => {
      byTestId<HTMLButtonElement>("replication-lag-read").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });
    act(() => {
      byTestId<HTMLButtonElement>("viz-timeline-step").click();
    });

    expect(container.querySelector('[data-testid="replication-lag-readlog-list"]')).toBeTruthy();
  });
});
