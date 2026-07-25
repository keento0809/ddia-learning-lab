/**
 * LsmTreeViz(T-204, 02§8.2「LsmTreeViz(Ch3)」)の状態・アクション型。
 * 状態: `{ memtable: SortedMap, sstables: Level[][], wal: Entry[] }`(設計書原文)を
 * 実装可能な形に具体化したもの。
 */

/** 全レベル共通のリビジョン番号。put/delete適用ごとに単調増加し、
 * コンパクション時に「同一keyの最新値」を判定する唯一の根拠にする
 * (複数SSTable/複数レベルにまたがる同一keyの新旧を、テーブルの並び順に
 * 依存せず決定するため)。 */
export type LsmSeq = number;

export interface LsmEntry {
  key: string;
  /** null = トゥームストーン(削除マーカー) */
  value: string | null;
  seq: LsmSeq;
}

export interface LsmSsTable {
  id: number;
  /** key昇順にソート済み */
  entries: LsmEntry[];
}

/** L0, L1, L2 の3レベル固定(教材用に十分な段数)。 */
export const LSM_MAX_LEVELS = 3;

export type LsmNoopReason = "empty-memtable" | "empty-level" | "deepest-level";

export type LsmEvent =
  | { kind: "put"; key: string; value: string }
  | { kind: "delete"; key: string }
  | { kind: "flush"; ssTableId: number; entryCount: number }
  | {
      kind: "compact";
      fromLevel: number;
      toLevel: number;
      mergedCount: number;
      resultCount: number;
      droppedTombstones: number;
    }
  | { kind: "noop"; reason: LsmNoopReason; level?: number };

export interface LsmTreeState {
  /** key昇順にソート済みのメモリ内テーブル */
  memtable: LsmEntry[];
  /** levels[0]がL0(最新側)。各レベルは複数SSTableを持てる(コンパクション前は特に)。 */
  levels: LsmSsTable[][];
  /** Write-Ahead-Log。put/delete適用順に追記され、flush時にクリアされる。 */
  wal: LsmEntry[];
  nextSeq: LsmSeq;
  nextSsTableId: number;
  /** 直近の操作(アニメーション・ナレーション用。初期状態ではnull) */
  lastEvent: LsmEvent | null;
}

export type LsmAction =
  | { type: "put"; key: string; value: string }
  | { type: "delete"; key: string }
  | { type: "flush" }
  | { type: "compact"; level: number };
