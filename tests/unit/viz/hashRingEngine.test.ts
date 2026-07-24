import { describe, expect, it } from "vitest";
import {
  BULK_KEY_COUNT,
  INITIAL_VNODES_PER_NODE,
  MAX_VNODES,
  MIN_VNODES,
  computeKeyCountsPerNode,
  computeKeyCountStdDev,
  createHashRingEngine,
  hashRingNarratable,
  type HashRingState,
} from "@/components/viz/hashRingEngine";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

/**
 * T-205 HashRingViz(Ch6, 02§8.2)のSimEngine単体テスト。
 * 共通受入基準(03「SimEngineロジックの単体テスト」)のうち本Viz固有の項目:
 * vnodes増で標準偏差が単調減少傾向・ノード追加時の移動率が理論値±15%。
 */

function buildRing(nodeCount: number, vnodesPerNode: number, keyCount: number): HashRingState {
  const engine = createHashRingEngine();
  engine.dispatch({ type: "setVnodes", count: vnodesPerNode });
  for (let i = 0; i < nodeCount; i++) {
    engine.dispatch({ type: "addNode" });
  }
  engine.dispatch({ type: "addKeys", count: keyCount });
  return engine.getState();
}

describe("hashRingEngine: createInitialState", () => {
  it("starts with no nodes/keys and the default vnodes-per-node", () => {
    const engine = createHashRingEngine();
    const state = engine.getState();
    expect(state.nodes).toEqual([]);
    expect(state.keys).toEqual([]);
    expect(state.vnodesPerNode).toBe(INITIAL_VNODES_PER_NODE);
    expect(state.lastOperation).toEqual({
      type: "init",
      targetId: null,
      movedCount: 0,
      movedRatio: 0,
      addedCount: 0,
    });
  });
});

describe("hashRingEngine: addNode", () => {
  it("appends a node with vnodesPerNode virtual nodes and sequential ids", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addNode" });
    const state = engine.getState();

    expect(state.nodes.map((node) => node.id)).toEqual(["node-1", "node-2"]);
    expect(state.nodes[0].vnodes).toHaveLength(INITIAL_VNODES_PER_NODE);
    expect(state.lastOperation.type).toBe("addNode");
    expect(state.lastOperation.targetId).toBe("node-2");
  });

  it("reassigns existing keys and records the moved-key ratio when a node is added", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addKeys", count: 500 });
    engine.dispatch({ type: "addNode" });
    const state = engine.getState();

    expect(state.keys.every((key) => key.ownerNodeId !== null)).toBe(true);
    expect(state.lastOperation.movedCount).toBeGreaterThan(0);
    expect(state.lastOperation.movedRatio).toBe(state.lastOperation.movedCount / state.keys.length);
  });
});

describe("hashRingEngine: removeNode", () => {
  it("removes the node and reassigns its keys to the remaining nodes", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "setVnodes", count: 100 });
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addKeys", count: 500 });

    const before = engine.getState();
    const keysOwnedByNode1 = before.keys.filter((key) => key.ownerNodeId === "node-1").length;

    engine.dispatch({ type: "removeNode", id: "node-1" });
    const after = engine.getState();

    expect(after.nodes.map((node) => node.id)).toEqual(["node-2"]);
    expect(after.keys.every((key) => key.ownerNodeId === "node-2")).toBe(true);
    expect(after.lastOperation).toMatchObject({
      type: "removeNode",
      targetId: "node-1",
      movedCount: keysOwnedByNode1,
    });
  });

  it("is a no-op when the given node id does not exist", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    const before = engine.getState();

    const after = engine.dispatch({ type: "removeNode", id: "no-such-node" });

    expect(after).toBe(before);
  });
});

describe("hashRingEngine: setVnodes", () => {
  it("clamps the requested count to [MIN_VNODES, MAX_VNODES]", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });

    engine.dispatch({ type: "setVnodes", count: 10_000 });
    expect(engine.getState().vnodesPerNode).toBe(MAX_VNODES);
    expect(engine.getState().nodes[0].vnodes).toHaveLength(MAX_VNODES);

    engine.dispatch({ type: "setVnodes", count: -5 });
    expect(engine.getState().vnodesPerNode).toBe(MIN_VNODES);
    expect(engine.getState().nodes[0].vnodes).toHaveLength(MIN_VNODES);
  });
});

describe("hashRingEngine: addKeys", () => {
  it("bulk-inserts BULK_KEY_COUNT keys and assigns each to a node when nodes exist", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addKeys", count: BULK_KEY_COUNT });
    const state = engine.getState();

    expect(state.keys).toHaveLength(BULK_KEY_COUNT);
    expect(state.keys.every((key) => key.ownerNodeId === "node-1")).toBe(true);
    expect(state.lastOperation).toMatchObject({ type: "addKeys", addedCount: BULK_KEY_COUNT });
  });

  it("leaves keys unowned when there are no nodes yet", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addKeys", count: 10 });
    const state = engine.getState();

    expect(state.keys.every((key) => key.ownerNodeId === null)).toBe(true);
    expect(computeKeyCountStdDev(state)).toBe(0);
  });
});

describe("hashRingEngine: computeKeyCountsPerNode / computeKeyCountStdDev", () => {
  it("counts zero keys per node when no keys have been added", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addNode" });
    const counts = computeKeyCountsPerNode(engine.getState());

    expect([...counts.values()]).toEqual([0, 0]);
    expect(computeKeyCountStdDev(engine.getState())).toBe(0);
  });

  it("standard deviation trends downward as vnodesPerNode increases for a fixed node/key count", () => {
    const nodeCount = 5;
    const keyCount = 3000;
    const vnodesSamples = [1, 4, 16, 64, 256];
    const stdDevs = vnodesSamples.map(
      (vnodesPerNode) => computeKeyCountStdDev(buildRing(nodeCount, vnodesPerNode, keyCount)),
    );

    // 決定的ハッシュ1回分のサンプルであり、個々のステップの厳密な単調減少は
    // 統計的揺らぎで崩れうるため「増加区間の大半で減少する」傾向性で検証する
    // (02§8.2「vnodes増で標準偏差が単調減少傾向」)。
    let decreasingSteps = 0;
    for (let i = 1; i < stdDevs.length; i++) {
      if (stdDevs[i] < stdDevs[i - 1]) decreasingSteps += 1;
    }
    expect(decreasingSteps).toBeGreaterThanOrEqual(stdDevs.length - 2);
    expect(stdDevs[stdDevs.length - 1]).toBeLessThan(stdDevs[0]);
  });

  it("moved-key ratio on adding a node matches the theoretical 1/(n+1) within ±15%", () => {
    const existingNodeCount = 4;
    const engine = createHashRingEngine();
    engine.dispatch({ type: "setVnodes", count: 150 });
    for (let i = 0; i < existingNodeCount; i++) {
      engine.dispatch({ type: "addNode" });
    }
    engine.dispatch({ type: "addKeys", count: 5000 });

    engine.dispatch({ type: "addNode" });
    const movedRatio = engine.getState().lastOperation.movedRatio;

    const theoreticalRatio = 1 / (existingNodeCount + 1);
    const relativeError = Math.abs(movedRatio - theoreticalRatio) / theoreticalRatio;
    expect(relativeError).toBeLessThanOrEqual(0.15);
  });
});

describe("hashRingEngine: hashRingNarratable.describeState", () => {
  it("renders the ja summary from messages/ja.json", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addKeys", count: 10 });
    const state = engine.getState();

    const t = getMessages("ja").hashRingViz.narrator;
    const expected = formatMessage(t.summary, {
      nodeCount: state.nodes.length,
      keyCount: state.keys.length,
      vnodesPerNode: state.vnodesPerNode,
      operation: t.operationLabels[state.lastOperation.type],
      movedRatio: (state.lastOperation.movedRatio * 100).toFixed(1),
      stdDev: computeKeyCountStdDev(state).toFixed(2),
    });

    expect(hashRingNarratable.describeState(state, "ja")).toBe(expected);
  });

  it("renders the en summary from messages/en.json", () => {
    const engine = createHashRingEngine();
    engine.dispatch({ type: "addNode" });
    engine.dispatch({ type: "addKeys", count: 10 });
    const state = engine.getState();

    const t = getMessages("en").hashRingViz.narrator;
    const expected = formatMessage(t.summary, {
      nodeCount: state.nodes.length,
      keyCount: state.keys.length,
      vnodesPerNode: state.vnodesPerNode,
      operation: t.operationLabels[state.lastOperation.type],
      movedRatio: (state.lastOperation.movedRatio * 100).toFixed(1),
      stdDev: computeKeyCountStdDev(state).toFixed(2),
    });

    expect(hashRingNarratable.describeState(state, "en")).toBe(expected);
  });

  it("produces different text for ja and en", () => {
    const engine = createHashRingEngine();
    const state = engine.getState();
    expect(hashRingNarratable.describeState(state, "ja")).not.toBe(
      hashRingNarratable.describeState(state, "en"),
    );
  });
});
