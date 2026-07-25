import type { SimEngineDefinition } from "@/components/viz/core/simEngine";
import { PRESETS } from "./presets";
import type {
  IsolationAction,
  IsolationLevel,
  IsolationState,
  OperationDef,
  PresetId,
  TxnId,
  TxnRuntime,
} from "./types";

/**
 * IsolationVizのドメインロジック(02§8.2)。SimEngineDefinition<IsolationState,
 * IsolationAction>として実装し、UIから完全に分離した純粋関数として単体テスト可能にする。
 *
 * 分離レベルの実装方針(独自解説。DDIA本文の引用・翻訳ではなく一般的なDB理論に基づく):
 * - read-uncommitted: 他トランザクションの未コミット書込みも読める(ダーティリード可)
 * - read-committed: 読取りは常に最新コミット値のみ(ダーティリード防止)
 * - repeatable-read(スナップショット分離): 各トランザクションは最初の操作時点の
 *   コミット済みストアのスナップショットを読み続ける(読取りスキュー防止)。
 *   コミット時、同じ実キーに対する書込み競合(ww)があれば後続コミット側をアボート
 *   (first-committer-wins)。
 * - serializable: repeatable-readの全チェックに加え、読取集合と書込集合が
 *   T1⇄T2の双方向でぶつかる(rw循環)場合もアボートする(書込みスキュー・
 *   ファントムを防止)。
 *
 * 書込みロック: どの分離レベルでも、あるキーへの書込みは、そのキーを未コミットで
 * 保持している他トランザクションが存在する間はブロックされる(実DBの一般的な
 * 書込みロック挙動)。ブロック中の操作はstep()実行時にスキップされ、ロックを
 * 保持するトランザクションのコミット/アボートが先に処理された後に再試行される。
 */

function createEmptyTxnRuntime(): TxnRuntime {
  return {
    status: "pending",
    snapshot: null,
    localWrites: {},
    reads: {},
    readSet: [],
    writeSet: [],
    otherCommittedBeforeSnapshot: false,
  };
}

export function createIsolationState(presetId: PresetId, isolationLevel: IsolationLevel): IsolationState {
  const preset = PRESETS[presetId];
  return {
    presetId,
    isolationLevel,
    operations: preset.operations,
    order: [...preset.defaultOrder],
    store: { ...preset.initialStore },
    txns: { T1: createEmptyTxnRuntime(), T2: createEmptyTxnRuntime() },
    completed: [],
    blockedOpId: null,
    lastEvent: null,
    eventLog: [],
  };
}

function getOperation(operations: OperationDef[], id: string): OperationDef {
  const found = operations.find((operation) => operation.id === id);
  if (!found) {
    throw new Error(`Unknown operation id: "${id}"`);
  }
  return found;
}

function otherTxnId(txn: TxnId): TxnId {
  return txn === "T1" ? "T2" : "T1";
}

/**
 * 各トランザクション内部の相対順序(operations宣言順)が保たれているかを検証する。
 * ドラッグ/キーボード操作は、この制約を破る並べ替えを常に拒否する。
 */
export function isValidOrder(operations: OperationDef[], order: string[]): boolean {
  if (order.length !== operations.length) return false;
  if (new Set(order).size !== order.length) return false;

  const perTxnOriginal: Record<TxnId, string[]> = { T1: [], T2: [] };
  for (const operation of operations) {
    perTxnOriginal[operation.txn].push(operation.id);
  }

  const perTxnInOrder: Record<TxnId, string[]> = { T1: [], T2: [] };
  for (const id of order) {
    const operation = getOperation(operations, id);
    perTxnInOrder[operation.txn].push(id);
  }

  return (
    perTxnOriginal.T1.join(",") === perTxnInOrder.T1.join(",") &&
    perTxnOriginal.T2.join(",") === perTxnInOrder.T2.join(",")
  );
}

export function moveOperation(order: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    toIndex < 0 ||
    toIndex >= order.length ||
    fromIndex === toIndex
  ) {
    return order;
  }
  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function realKeysOnly(tokens: string[]): string[] {
  return tokens.filter((token) => !token.startsWith("predicate:"));
}

function intersects(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((token) => setB.has(token));
}

function visibleReadValue(
  level: IsolationLevel,
  reader: TxnRuntime,
  other: TxnRuntime,
  store: Record<string, number>,
  key: string,
): { value: number; dirty: boolean } {
  if (key in reader.localWrites) {
    return { value: reader.localWrites[key], dirty: false };
  }
  if (level === "read-uncommitted" && other.status === "active" && key in other.localWrites) {
    return { value: other.localWrites[key], dirty: true };
  }
  if ((level === "repeatable-read" || level === "serializable") && reader.snapshot) {
    return { value: reader.snapshot[key], dirty: false };
  }
  return { value: store[key], dirty: false };
}

function resolveWriteValue(op: Extract<OperationDef, { kind: "write" }>, reader: TxnRuntime): number {
  if (op.value.kind === "fixed") {
    return op.value.value;
  }
  return reader.reads[op.value.key] + op.value.delta;
}

/** ロック中(=他のアクティブなトランザクションが同じキーを未コミットで保持中)かどうか */
function isLocked(state: IsolationState, txn: TxnId, key: string): boolean {
  const other = state.txns[otherTxnId(txn)];
  return other.status === "active" && key in other.localWrites;
}

function captureSnapshotIfNeeded(state: IsolationState, txn: TxnId): void {
  const runtime = state.txns[txn];
  if (runtime.status === "pending") {
    runtime.status = "active";
  }
  if ((state.isolationLevel === "repeatable-read" || state.isolationLevel === "serializable") && !runtime.snapshot) {
    runtime.snapshot = { ...state.store };
    runtime.otherCommittedBeforeSnapshot = state.txns[otherTxnId(txn)].status === "committed";
  }
}

function tryCommit(state: IsolationState, txn: TxnId): "committed" | "aborted" {
  const runtime = state.txns[txn];
  const other = state.txns[otherTxnId(txn)];
  const level = state.isolationLevel;

  const overlapped =
    (level === "repeatable-read" || level === "serializable") &&
    other.status === "committed" &&
    !runtime.otherCommittedBeforeSnapshot;

  if (overlapped) {
    const wwConflict = intersects(realKeysOnly(runtime.writeSet), realKeysOnly(other.writeSet));
    const rwCycle =
      level === "serializable" &&
      intersects(runtime.readSet, other.writeSet) &&
      intersects(other.readSet, runtime.writeSet);

    if (wwConflict || rwCycle) {
      runtime.status = "aborted";
      runtime.localWrites = {};
      return "aborted";
    }
  }

  for (const [key, value] of Object.entries(runtime.localWrites)) {
    state.store[key] = value;
  }
  runtime.status = "committed";
  return "committed";
}

/** stateを直接書き換える(内部専用)。呼び出し側でstructuredCloneした下書きに対して使う */
function executeOperation(state: IsolationState, opId: string): NonNullable<IsolationState["lastEvent"]> {
  const operation = getOperation(state.operations, opId);
  const runtime = state.txns[operation.txn];
  const other = state.txns[otherTxnId(operation.txn)];

  if (operation.kind === "read") {
    captureSnapshotIfNeeded(state, operation.txn);
    const { value, dirty } = visibleReadValue(state.isolationLevel, runtime, other, state.store, operation.key);
    runtime.reads[operation.key] = value;
    runtime.readSet.push(operation.predicateKey ?? operation.key);
    return { opId, txn: operation.txn, outcomeKind: "read", key: operation.key, value, dirty };
  }

  if (operation.kind === "write") {
    captureSnapshotIfNeeded(state, operation.txn);
    const value = resolveWriteValue(operation, runtime);
    runtime.localWrites[operation.key] = value;
    runtime.writeSet.push(operation.key);
    if (operation.predicateKey) {
      runtime.writeSet.push(operation.predicateKey);
    }
    return { opId, txn: operation.txn, outcomeKind: "write-applied", key: operation.key, value };
  }

  // commit
  captureSnapshotIfNeeded(state, operation.txn);
  const result = tryCommit(state, operation.txn);
  return {
    opId,
    txn: operation.txn,
    outcomeKind: result === "committed" ? "commit-ok" : "commit-aborted",
  };
}

function cloneState(state: IsolationState): IsolationState {
  return {
    ...state,
    store: { ...state.store },
    txns: {
      T1: { ...state.txns.T1, localWrites: { ...state.txns.T1.localWrites }, reads: { ...state.txns.T1.reads }, readSet: [...state.txns.T1.readSet], writeSet: [...state.txns.T1.writeSet], snapshot: state.txns.T1.snapshot ? { ...state.txns.T1.snapshot } : null },
      T2: { ...state.txns.T2, localWrites: { ...state.txns.T2.localWrites }, reads: { ...state.txns.T2.reads }, readSet: [...state.txns.T2.readSet], writeSet: [...state.txns.T2.writeSet], snapshot: state.txns.T2.snapshot ? { ...state.txns.T2.snapshot } : null },
    },
    completed: [...state.completed],
    order: [...state.order],
    eventLog: [...state.eventLog],
  };
}

/**
 * 実行中のトランザクションが書込みロック待ちでブロックされている場合、そのオペレーションを
 * 飛ばして先の実行可能なオペレーションを探す(スキップアヘッド)。ブロック中のオペレーションは
 * ロック保持側のコミット/アボートが処理された後、再度先頭から走査されて実行される。
 */
export function step(state: IsolationState): IsolationState {
  const completedSet = new Set(state.completed);
  const next = cloneState(state);
  next.blockedOpId = null;

  for (const opId of state.order) {
    if (completedSet.has(opId)) continue;
    const operation = getOperation(state.operations, opId);

    if (operation.kind === "write" && isLocked(state, operation.txn, operation.key)) {
      next.blockedOpId = opId;
      continue;
    }

    const event = executeOperation(next, opId);
    next.completed.push(opId);
    next.lastEvent = event;
    next.eventLog.push(event);
    return next;
  }

  // 実行可能なオペレーションがない(全完了、または全てブロック中)
  return next;
}

function applyAction(state: IsolationState, action: IsolationAction): IsolationState {
  switch (action.type) {
    case "select-preset":
      return createIsolationState(action.presetId, state.isolationLevel);
    case "select-level":
      return createIsolationState(state.presetId, action.level);
    case "reorder": {
      if (state.completed.length > 0) return state;
      const candidate = moveOperation(state.order, action.fromIndex, action.toIndex);
      if (!isValidOrder(state.operations, candidate)) return state;
      return { ...cloneState(state), order: candidate };
    }
    default:
      return state;
  }
}

export const isolationSimDefinition: SimEngineDefinition<IsolationState, IsolationAction> = {
  createInitialState: () => createIsolationState("dirty-read", "read-uncommitted"),
  applyAction: (state, action) => applyAction(state, action),
  advance: (state) => step(state),
};
