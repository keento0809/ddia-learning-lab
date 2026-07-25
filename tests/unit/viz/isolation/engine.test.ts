import { describe, expect, it } from "vitest";
import { createSimEngine } from "@/components/viz/core/simEngine";
import {
  createIsolationState,
  isValidOrder,
  isolationSimDefinition,
  moveOperation,
  step,
} from "@/components/viz/isolation/engine";
import { PRESETS } from "@/components/viz/isolation/presets";
import type { IsolationLevel, PresetId } from "@/components/viz/isolation/types";

/**
 * T-208受入基準「SimEngineの単体テスト: 4プリセットが各分離レベルで設計書どおりの
 * 結果が合格」。02§8.2は「分離レベル選択で結果(読める値/ブロック/アボート)が
 * 変化する」ことのみを定めており、具体的な期待値は一般的なDB理論(ANSI SQL分離
 * レベルとダーティリード/読取りスキュー/書込みスキュー/ファントムの関係)に基づく
 * 独自実装(components/viz/isolation/engine.tsのコメント参照、DDIA本文の引用ではない)。
 */

function runToCompletion(presetId: PresetId, level: IsolationLevel) {
  let state = createIsolationState(presetId, level);
  const preset = PRESETS[presetId];
  // 安全弁: プリセットの操作数を超えて回さない(ブロック解消の再試行を含めても
  // 操作数以内で必ず完了する設計のため、超過は無限ループ化のバグを示す)。
  for (let i = 0; i < preset.operations.length + 2; i++) {
    if (state.completed.length === preset.operations.length) break;
    state = step(state);
  }
  return state;
}

describe("IsolationViz engine: dirty-read preset", () => {
  it("read-uncommitted: T2 dirty-reads T1's uncommitted write, then blocks until T1 commits, then overwrites", () => {
    const final = runToCompletion("dirty-read", "read-uncommitted");
    expect(final.completed).toHaveLength(5);
    expect(final.txns.T2.reads.balance).toBe(50); // dirty read of T1's uncommitted value
    expect(final.txns.T1.status).toBe("committed");
    expect(final.txns.T2.status).toBe("committed");
    expect(final.store.balance).toBe(60); // T2's write derived from the dirty read (50) + 10
  });

  it("read-committed: T2 never sees the uncommitted value, but still commits its own (stale-read) write", () => {
    const final = runToCompletion("dirty-read", "read-committed");
    expect(final.txns.T2.reads.balance).toBe(100); // sees last committed value, not T1's uncommitted 50
    expect(final.txns.T1.status).toBe("committed");
    expect(final.txns.T2.status).toBe("committed");
    expect(final.store.balance).toBe(110); // 100 (stale read) + 10, overwrites T1's 50
  });

  it("repeatable-read: T2 is aborted at commit due to a write-write conflict on balance", () => {
    const final = runToCompletion("dirty-read", "repeatable-read");
    expect(final.txns.T1.status).toBe("committed");
    expect(final.txns.T2.status).toBe("aborted");
    expect(final.store.balance).toBe(50); // only T1's committed write survives
  });

  it("serializable: same write-write conflict also aborts T2", () => {
    const final = runToCompletion("dirty-read", "serializable");
    expect(final.txns.T2.status).toBe("aborted");
    expect(final.store.balance).toBe(50);
  });

  it("blocks T2's write while T1 still holds the uncommitted write lock on the same key", () => {
    let state = createIsolationState("dirty-read", "read-uncommitted");
    state = step(state); // t1-write
    state = step(state); // t2-read
    state = step(state); // attempts t2-write -> blocked, skip-ahead executes t1-commit instead
    expect(state.blockedOpId).toBe("t2-write");
    expect(state.completed).toContain("t1-commit");
    expect(state.completed).not.toContain("t2-write");
  });
});

describe("IsolationViz engine: read-skew preset", () => {
  it.each<[IsolationLevel, number, number]>([
    ["read-uncommitted", 500, 600],
    ["read-committed", 500, 600],
  ])("%s: T2 observes an inconsistent total across its two reads", (level, expectedA, expectedB) => {
    const final = runToCompletion("read-skew", level);
    expect(final.txns.T2.reads.accountA).toBe(expectedA);
    expect(final.txns.T2.reads.accountB).toBe(expectedB);
    expect(expectedA + expectedB).not.toBe(1000); // inconsistent combined total: the anomaly
    expect(final.txns.T2.status).toBe("committed");
  });

  it.each<IsolationLevel>(["repeatable-read", "serializable"])(
    "%s: T2's snapshot keeps both reads consistent at the pre-transfer values, no abort needed",
    (level) => {
      const final = runToCompletion("read-skew", level);
      expect(final.txns.T2.reads.accountA).toBe(500);
      expect(final.txns.T2.reads.accountB).toBe(500);
      expect(final.txns.T2.status).toBe("committed"); // read-only, no conflicting write => no abort
      expect(final.txns.T1.status).toBe("committed");
      expect(final.store).toEqual({ accountA: 400, accountB: 600 });
    },
  );
});

describe("IsolationViz engine: write-skew preset", () => {
  it.each<IsolationLevel>(["read-uncommitted", "read-committed", "repeatable-read"])(
    "%s: both T1 and T2 go off-call, violating the invariant",
    (level) => {
      const final = runToCompletion("write-skew", level);
      expect(final.store.aliceOnCall).toBe(0);
      expect(final.store.bobOnCall).toBe(0);
      expect(final.txns.T1.status).toBe("committed");
      expect(final.txns.T2.status).toBe("committed");
    },
  );

  it("serializable: detects the rw-conflict cycle and aborts the second committer (T2)", () => {
    const final = runToCompletion("write-skew", "serializable");
    expect(final.txns.T1.status).toBe("committed");
    expect(final.txns.T2.status).toBe("aborted");
    expect(final.store.aliceOnCall).toBe(0);
    expect(final.store.bobOnCall).toBe(1); // T2's write discarded, invariant preserved
  });
});

describe("IsolationViz engine: phantom preset", () => {
  it.each<IsolationLevel>(["read-uncommitted", "read-committed", "repeatable-read"])(
    "%s: both bookings are inserted (double booking)",
    (level) => {
      const final = runToCompletion("phantom", level);
      expect(final.store.bookingT1).toBe(1);
      expect(final.store.bookingT2).toBe(1);
      expect(final.txns.T1.status).toBe("committed");
      expect(final.txns.T2.status).toBe("committed");
    },
  );

  it("serializable: detects the predicate rw-conflict and aborts the second insert", () => {
    const final = runToCompletion("phantom", "serializable");
    expect(final.store.bookingT1).toBe(1);
    expect(final.store.bookingT2).toBe(0);
    expect(final.txns.T2.status).toBe("aborted");
  });
});

describe("IsolationViz engine: reordering", () => {
  it("isValidOrder rejects orders that break a transaction's own relative sequence", () => {
    const operations = PRESETS["dirty-read"].operations;
    const original = operations.map((o) => o.id);
    expect(isValidOrder(operations, original)).toBe(true);

    // t2-write と t2-commit を入れ替える(T2内部の順序が崩れる)
    const swapped = moveOperation(original, original.indexOf("t2-commit"), original.indexOf("t2-write"));
    expect(isValidOrder(operations, swapped)).toBe(false);
  });

  it("isValidOrder accepts interleavings that only reorder across transactions", () => {
    const operations = PRESETS["dirty-read"].operations;
    // t1-write を先頭に固定したまま t2-read を先に持ってくる(T1同士・T2同士の相対順序は保持)
    const reordered = ["t2-read", "t1-write", "t2-write", "t1-commit", "t2-commit"];
    expect(isValidOrder(operations, reordered)).toBe(true);
  });

  it("dispatch(reorder) is rejected once execution has begun, but accepted before any step", () => {
    const engine = createSimEngine(isolationSimDefinition, { seed: 1 });
    const before = engine.getState().order;
    const fromIndex = before.indexOf("t1-write");
    const toIndex = before.indexOf("t2-read");

    const reordered = engine.dispatch({ type: "reorder", fromIndex, toIndex });
    expect(reordered.order).not.toEqual(before);

    engine.step();
    const orderAfterStep = engine.getState().order;
    const rejected = engine.dispatch({
      type: "reorder",
      fromIndex: 0,
      toIndex: orderAfterStep.length - 1,
    });
    expect(rejected.order).toEqual(orderAfterStep); // 実行開始後は並べ替えを拒否(no-op)
  });

  it("dispatch(select-preset) and dispatch(select-level) reset execution progress", () => {
    const engine = createSimEngine(isolationSimDefinition, { seed: 1 });
    engine.step();
    engine.step();
    expect(engine.getState().completed.length).toBeGreaterThan(0);

    const afterLevelChange = engine.dispatch({ type: "select-level", level: "serializable" });
    expect(afterLevelChange.completed).toHaveLength(0);
    expect(afterLevelChange.isolationLevel).toBe("serializable");

    engine.step();
    const afterPresetChange = engine.dispatch({ type: "select-preset", presetId: "phantom" });
    expect(afterPresetChange.completed).toHaveLength(0);
    expect(afterPresetChange.presetId).toBe("phantom");
    expect(afterPresetChange.isolationLevel).toBe("serializable"); // レベル選択は保持される
  });
});

describe("IsolationViz engine: determinism (SimEngine contract)", () => {
  it("produces identical results for the same preset/level regardless of rng (no randomness involved)", () => {
    const a = runToCompletion("write-skew", "serializable");
    const b = runToCompletion("write-skew", "serializable");
    expect(a.store).toEqual(b.store);
    expect(a.txns.T2.status).toBe(b.txns.T2.status);
  });
});
