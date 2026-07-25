import type { LocalizedText } from "@/lib/contracts";

/**
 * IsolationViz(Ch7, 02§8.2)のドメイン型。
 * 2トランザクション(T1/T2)がキーの読み書きを行う操作列を、ユーザーが
 * ドラッグ/キーボードで並べ替え(トランザクション内部の相対順序は保持したまま)、
 * 分離レベルごとに結果(読める値/ブロック/アボート)がどう変わるかを観察する。
 */
export type TxnId = "T1" | "T2";

export type IsolationLevel =
  | "read-uncommitted"
  | "read-committed"
  | "repeatable-read"
  | "serializable";

export const ISOLATION_LEVELS: readonly IsolationLevel[] = [
  "read-uncommitted",
  "read-committed",
  "repeatable-read",
  "serializable",
];

/** 書き込み値。固定値、または「このトランザクションが直近に読んだ値+delta」の派生値 */
export type WriteValue = { kind: "fixed"; value: number } | { kind: "deriveFromRead"; key: string; delta: number };

interface OperationBase {
  id: string;
  txn: TxnId;
  /** UI上のラベル(操作の内容そのものはドメインデータであり messages.json のUI文言ではないため、ここに ja/en を併記する) */
  label: LocalizedText;
}

export interface ReadOperation extends OperationBase {
  kind: "read";
  key: string;
  /** 述語(範囲)読取りの場合、ファントム検出用の仮想キー。省略時はkey自体を読取集合に使う */
  predicateKey?: string;
}

export interface WriteOperation extends OperationBase {
  kind: "write";
  key: string;
  value: WriteValue;
  /** 書込みが影響する述語(範囲)の仮想キー(ファントム検出用) */
  predicateKey?: string;
}

export interface CommitOperation extends OperationBase {
  kind: "commit";
}

export type OperationDef = ReadOperation | WriteOperation | CommitOperation;

export type PresetId = "dirty-read" | "read-skew" | "write-skew" | "phantom";

export interface PresetDefinition {
  id: PresetId;
  title: LocalizedText;
  description: LocalizedText;
  /** 初期状態(コミット済みストア) */
  initialStore: Record<string, number>;
  operations: OperationDef[];
  /** 既定の(アノマリーが再現される)実行順序。operationsのid列 */
  defaultOrder: string[];
}

export type StepOutcomeKind =
  | "read"
  | "write-committed-lock-wait"
  | "write-applied"
  | "commit-ok"
  | "commit-aborted";

export interface StepEvent {
  opId: string;
  txn: TxnId;
  outcomeKind: StepOutcomeKind;
  key?: string;
  value?: number;
  /** kind==="read"の場合、読み取った値が他トランザクションの未コミット書込みであったか */
  dirty?: boolean;
}

export type TxnStatus = "pending" | "active" | "committed" | "aborted";

export interface TxnRuntime {
  status: TxnStatus;
  /** repeatable-read/serializableでのみ使用。最初の操作時点のコミット済みストアのコピー */
  snapshot: Record<string, number> | null;
  /** このトランザクションの未コミット書込み(ロック保持中のキー) */
  localWrites: Record<string, number>;
  /** このトランザクションが記録した読取り結果(read-your-own-writes・派生書込みに使用) */
  reads: Record<string, number>;
  /** 読取集合(キー or 述語キー)。serializableのrw競合検出に使用 */
  readSet: string[];
  /** 書込集合(キー or 述語キー)。ww/rw競合検出に使用 */
  writeSet: string[];
  /**
   * repeatable-read/serializableでスナップショット取得時、相手トランザクションが
   * 既にコミット済みだったか(=このトランザクションの開始前に完了しており、
   * 並行実行ではなかったか)。true の場合はコミット時の競合チェックを行わない。
   */
  otherCommittedBeforeSnapshot: boolean;
}

export interface IsolationState {
  presetId: PresetId;
  isolationLevel: IsolationLevel;
  operations: OperationDef[];
  /** 現在の実行順序(operationsのid列、並べ替え可能) */
  order: string[];
  /** コミット済みストア */
  store: Record<string, number>;
  txns: Record<TxnId, TxnRuntime>;
  /** 完了済み操作id集合 */
  completed: string[];
  /** 現在ロック待ちでブロックされている操作id(あれば) */
  blockedOpId: string | null;
  /** 直近のstep()で発生したイベント(narrator用) */
  lastEvent: StepEvent | null;
  /** これまでに発生した全イベントの履歴(opId毎に完了時の結果をUIへ表示するため) */
  eventLog: StepEvent[];
}

export type IsolationAction =
  | { type: "select-preset"; presetId: PresetId }
  | { type: "select-level"; level: IsolationLevel }
  | { type: "reorder"; fromIndex: number; toIndex: number };
