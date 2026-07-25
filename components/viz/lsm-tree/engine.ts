import { createSimEngine, type SimEngineDefinition } from "@/components/viz/core/simEngine";
import type { CreateSimEngineOptions } from "@/components/viz/core/simEngine";
import type { SimEngine } from "@/lib/contracts";
import {
  LSM_MAX_LEVELS,
  type LsmAction,
  type LsmEntry,
  type LsmSsTable,
  type LsmTreeState,
} from "./types";

/** 02§8.2 LsmTreeViz「状態: { memtable: SortedMap, sstables: Level[][], wal: Entry[] }」の初期状態。 */
export function createInitialLsmTreeState(): LsmTreeState {
  return {
    memtable: [],
    levels: Array.from({ length: LSM_MAX_LEVELS }, () => []),
    wal: [],
    nextSeq: 1,
    nextSsTableId: 1,
    lastEvent: null,
  };
}

/** key昇順を維持したまま同一keyを上書き挿入する(SortedMapのupsert相当)。 */
export function upsertSorted(entries: LsmEntry[], entry: LsmEntry): LsmEntry[] {
  const index = entries.findIndex((existing) => existing.key === entry.key);
  if (index === -1) {
    const next = [...entries, entry];
    next.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return next;
  }
  const next = [...entries];
  next[index] = entry;
  return next;
}

/**
 * 複数のエントリ列(=複数SSTableの内容)をkeyでグルーピングし、各keyについて
 * 最も新しいseqを持つエントリのみを残してkey昇順に統合する。
 * 02§8.2「コンパクション時...「同一keyの新しい値が勝つ」」の中核ロジック。
 * どのテーブルの並び順にも依存しない(seqのみで新旧を判定する)ことが、
 * 受入基準(4)「コンパクション後に同一keyの最新値のみ残る」の根拠になる。
 */
export function mergeEntriesByLatestSeq(entryGroups: LsmEntry[][]): LsmEntry[] {
  const latestByKey = new Map<string, LsmEntry>();
  for (const entries of entryGroups) {
    for (const entry of entries) {
      const current = latestByKey.get(entry.key);
      if (!current || entry.seq > current.seq) {
        latestByKey.set(entry.key, entry);
      }
    }
  }
  return Array.from(latestByKey.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}

/** トゥームストーン(value:null)を取り除く。最深レベルへのコンパクション時のみ使う
 * (それより下に「隠すべき古い値」が存在しないレベルでは、削除マーカー自体を
 * 保持し続ける意味がないため)。 */
export function dropTombstones(entries: LsmEntry[]): LsmEntry[] {
  return entries.filter((entry) => entry.value !== null);
}

export function applyLsmAction(state: LsmTreeState, action: LsmAction): LsmTreeState {
  switch (action.type) {
    case "put": {
      const entry: LsmEntry = { key: action.key, value: action.value, seq: state.nextSeq };
      return {
        ...state,
        memtable: upsertSorted(state.memtable, entry),
        wal: [...state.wal, entry],
        nextSeq: state.nextSeq + 1,
        lastEvent: { kind: "put", key: action.key, value: action.value },
      };
    }
    case "delete": {
      const entry: LsmEntry = { key: action.key, value: null, seq: state.nextSeq };
      return {
        ...state,
        memtable: upsertSorted(state.memtable, entry),
        wal: [...state.wal, entry],
        nextSeq: state.nextSeq + 1,
        lastEvent: { kind: "delete", key: action.key },
      };
    }
    case "flush": {
      if (state.memtable.length === 0) {
        return { ...state, lastEvent: { kind: "noop", reason: "empty-memtable" } };
      }
      const table: LsmSsTable = { id: state.nextSsTableId, entries: state.memtable };
      const levels = state.levels.map((level, index) => (index === 0 ? [...level, table] : level));
      return {
        ...state,
        memtable: [],
        wal: [],
        levels,
        nextSsTableId: state.nextSsTableId + 1,
        lastEvent: { kind: "flush", ssTableId: table.id, entryCount: table.entries.length },
      };
    }
    case "compact": {
      const { level } = action;
      if (level < 0 || level >= LSM_MAX_LEVELS - 1) {
        return { ...state, lastEvent: { kind: "noop", reason: "deepest-level", level } };
      }
      const sourceTables = state.levels[level];
      if (sourceTables.length === 0) {
        return { ...state, lastEvent: { kind: "noop", reason: "empty-level", level } };
      }
      const targetLevel = level + 1;
      const targetTables = state.levels[targetLevel];
      const groups = [...sourceTables, ...targetTables].map((table) => table.entries);
      const mergedBeforeDrop = mergeEntriesByLatestSeq(groups);
      const isDeepest = targetLevel === LSM_MAX_LEVELS - 1;
      const merged = isDeepest ? dropTombstones(mergedBeforeDrop) : mergedBeforeDrop;
      const newTable: LsmSsTable = { id: state.nextSsTableId, entries: merged };
      const levels = state.levels.map((existing, index) => {
        if (index === level) return [];
        if (index === targetLevel) return [newTable];
        return existing;
      });
      return {
        ...state,
        levels,
        nextSsTableId: state.nextSsTableId + 1,
        lastEvent: {
          kind: "compact",
          fromLevel: level,
          toLevel: targetLevel,
          mergedCount: mergedBeforeDrop.length,
          resultCount: merged.length,
          droppedTombstones: mergedBeforeDrop.length - merged.length,
        },
      };
    }
    default:
      return state;
  }
}

const lsmTreeDefinition: SimEngineDefinition<LsmTreeState, LsmAction> = {
  createInitialState: () => createInitialLsmTreeState(),
  applyAction: (state, action) => applyLsmAction(state, action),
  // LSM-Treeはput/delete/flush/compactというユーザー操作でのみ状態が進む
  // (Raftのタイマー等と異なり自律的な時間経過を持たないため、advanceは恒等関数)。
  advance: (state) => state,
};

export function createLsmTreeEngine(
  options?: CreateSimEngineOptions,
): SimEngine<LsmTreeState, LsmAction> {
  return createSimEngine(lsmTreeDefinition, options);
}
