import { describe, expect, it } from "vitest";
import {
  applyLsmAction,
  createInitialLsmTreeState,
  createLsmTreeEngine,
  dropTombstones,
  mergeEntriesByLatestSeq,
  upsertSorted,
} from "@/components/viz/lsm-tree/engine";
import type { LsmEntry, LsmTreeState } from "@/components/viz/lsm-tree/types";

/**
 * T-204受入基準(4)「SimEngineの単体テスト: コンパクション後に同一keyの最新値のみ
 * 残る / 削除トゥームストーン処理 が合格」。02§8.2 LsmTreeViz「コンパクション時...
 * 「同一keyの新しい値が勝つ」」/ 02§11「LSM: コンパクション後の最新値優先」。
 */

function put(state: LsmTreeState, key: string, value: string): LsmTreeState {
  return applyLsmAction(state, { type: "put", key, value });
}
function del(state: LsmTreeState, key: string): LsmTreeState {
  return applyLsmAction(state, { type: "delete", key });
}
function flush(state: LsmTreeState): LsmTreeState {
  return applyLsmAction(state, { type: "flush" });
}
function compact(state: LsmTreeState, level: number): LsmTreeState {
  return applyLsmAction(state, { type: "compact", level });
}

describe("upsertSorted", () => {
  it("inserts new keys in sorted order", () => {
    let entries: LsmEntry[] = [];
    entries = upsertSorted(entries, { key: "b", value: "1", seq: 1 });
    entries = upsertSorted(entries, { key: "a", value: "2", seq: 2 });
    entries = upsertSorted(entries, { key: "c", value: "3", seq: 3 });
    expect(entries.map((e) => e.key)).toEqual(["a", "b", "c"]);
  });

  it("overwrites an existing key in place rather than duplicating it", () => {
    let entries: LsmEntry[] = [{ key: "a", value: "1", seq: 1 }];
    entries = upsertSorted(entries, { key: "a", value: "2", seq: 2 });
    expect(entries).toEqual([{ key: "a", value: "2", seq: 2 }]);
  });
});

describe("mergeEntriesByLatestSeq", () => {
  it("keeps only the highest-seq entry per key regardless of table order", () => {
    const older: LsmEntry[] = [{ key: "a", value: "old", seq: 1 }];
    const newer: LsmEntry[] = [{ key: "a", value: "new", seq: 5 }];
    // 古いテーブルを後に渡しても(配列順に依存しない)、seqの大きい方が勝つ。
    expect(mergeEntriesByLatestSeq([newer, older])).toEqual([{ key: "a", value: "new", seq: 5 }]);
    expect(mergeEntriesByLatestSeq([older, newer])).toEqual([{ key: "a", value: "new", seq: 5 }]);
  });

  it("returns the union of keys sorted ascending", () => {
    const a: LsmEntry[] = [{ key: "c", value: "1", seq: 1 }];
    const b: LsmEntry[] = [{ key: "a", value: "2", seq: 2 }];
    expect(mergeEntriesByLatestSeq([a, b]).map((e) => e.key)).toEqual(["a", "c"]);
  });
});

describe("dropTombstones", () => {
  it("removes entries with a null value and keeps the rest", () => {
    const entries: LsmEntry[] = [
      { key: "a", value: "1", seq: 1 },
      { key: "b", value: null, seq: 2 },
    ];
    expect(dropTombstones(entries)).toEqual([{ key: "a", value: "1", seq: 1 }]);
  });
});

describe("LSM-Tree state machine: put/delete/flush/compact", () => {
  it("put writes into the memtable and appends to the WAL", () => {
    const state = put(createInitialLsmTreeState(), "a", "1");
    expect(state.memtable).toEqual([{ key: "a", value: "1", seq: 1 }]);
    expect(state.wal).toEqual([{ key: "a", value: "1", seq: 1 }]);
  });

  it("delete records a tombstone (null value) in the memtable", () => {
    const state = del(createInitialLsmTreeState(), "a");
    expect(state.memtable).toEqual([{ key: "a", value: null, seq: 1 }]);
  });

  it("flush moves the memtable into a new L0 SSTable and clears memtable+WAL", () => {
    let state = put(createInitialLsmTreeState(), "a", "1");
    state = flush(state);
    expect(state.memtable).toEqual([]);
    expect(state.wal).toEqual([]);
    expect(state.levels[0]).toHaveLength(1);
    expect(state.levels[0][0].entries).toEqual([{ key: "a", value: "1", seq: 1 }]);
  });

  it("flush is a no-op when the memtable is empty", () => {
    const before = createInitialLsmTreeState();
    const after = flush(before);
    expect(after.levels).toEqual(before.levels);
    expect(after.lastEvent).toEqual({ kind: "noop", reason: "empty-memtable" });
  });

  it("compaction after two flushes of the same key keeps only the latest value", () => {
    let state = createInitialLsmTreeState();
    state = flush(put(state, "user:1", "v1"));
    state = flush(put(state, "user:1", "v2"));
    expect(state.levels[0]).toHaveLength(2);

    state = compact(state, 0);

    expect(state.levels[0]).toEqual([]);
    expect(state.levels[1]).toHaveLength(1);
    expect(state.levels[1][0].entries).toEqual([{ key: "user:1", value: "v2", seq: 2 }]);
  });

  it("compaction merges distinct keys from multiple SSTables without loss", () => {
    let state = createInitialLsmTreeState();
    state = flush(put(state, "a", "1"));
    state = flush(put(state, "b", "2"));
    state = compact(state, 0);
    expect(state.levels[1][0].entries).toEqual([
      { key: "a", value: "1", seq: 1 },
      { key: "b", value: "2", seq: 2 },
    ]);
  });

  it("compact is a no-op when the source level has no SSTables", () => {
    const before = createInitialLsmTreeState();
    const after = compact(before, 0);
    expect(after.levels).toEqual(before.levels);
    expect(after.lastEvent).toEqual({ kind: "noop", reason: "empty-level", level: 0 });
  });

  it("compact is a no-op at the deepest level (nothing below it)", () => {
    const before = createInitialLsmTreeState();
    const deepest = before.levels.length - 1;
    const after = compact(before, deepest);
    expect(after.levels).toEqual(before.levels);
    expect(after.lastEvent).toEqual({ kind: "noop", reason: "deepest-level", level: deepest });
  });

  it("tombstone processing: a delete survives an intermediate compaction, then is dropped once compacted into the deepest level", () => {
    let state = createInitialLsmTreeState();
    state = flush(put(state, "a", "1"));
    state = flush(del(state, "a"));
    expect(state.levels[0]).toHaveLength(2);

    // L0 -> L1: L1はまだ最深レベルではないため、トゥームストーンは残る。
    state = compact(state, 0);
    expect(state.levels[1]).toHaveLength(1);
    expect(state.levels[1][0].entries).toEqual([{ key: "a", value: null, seq: 2 }]);
    expect(state.lastEvent).toMatchObject({ kind: "compact", droppedTombstones: 0 });

    // L1 -> L2: L2は最深レベルのため、トゥームストーンは破棄されキー自体が消える。
    state = compact(state, 1);
    expect(state.levels[2]).toHaveLength(1);
    expect(state.levels[2][0].entries).toEqual([]);
    expect(state.lastEvent).toMatchObject({ kind: "compact", droppedTombstones: 1 });
  });

  it("tombstone shadows an older value already present at the target level during compaction", () => {
    let state = createInitialLsmTreeState();
    // 先に "a" -> "1" をL1へ到達させる。
    state = flush(put(state, "a", "1"));
    state = compact(state, 0);
    expect(state.levels[1][0].entries).toEqual([{ key: "a", value: "1", seq: 1 }]);

    // 新しく delete("a") をL0に積み、L0->L1のコンパクションで既存のL1値を上書きする。
    state = flush(del(state, "a"));
    state = compact(state, 0);
    expect(state.levels[1][0].entries).toEqual([{ key: "a", value: null, seq: 2 }]);
  });
});

describe("createLsmTreeEngine (SimEngine integration)", () => {
  it("wires dispatch/getState/reset through the shared createSimEngine", () => {
    const engine = createLsmTreeEngine();
    engine.dispatch({ type: "put", key: "a", value: "1" });
    expect(engine.getState().memtable).toEqual([{ key: "a", value: "1", seq: 1 }]);

    engine.dispatch({ type: "flush" });
    engine.dispatch({ type: "compact", level: 0 });
    expect(engine.getState().levels[1]).toHaveLength(1);

    const resetState = engine.reset();
    expect(resetState).toEqual(createInitialLsmTreeState());
    expect(engine.getState()).toEqual(createInitialLsmTreeState());
  });

  it("notifies subscribers on each dispatch", () => {
    const engine = createLsmTreeEngine();
    const seen: string[] = [];
    engine.subscribe((state) => seen.push(state.lastEvent?.kind ?? "none"));
    engine.dispatch({ type: "put", key: "a", value: "1" });
    engine.dispatch({ type: "flush" });
    expect(seen).toEqual(["put", "flush"]);
  });
});
