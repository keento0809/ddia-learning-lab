import type { OperationDef, PresetDefinition, PresetId } from "./types";

/**
 * IsolationVizの4プリセットシナリオ(02§8.2「ダーティリード/読取りスキュー/
 * 書込みスキュー/ファントムのプリセットシナリオ」)。
 * 各操作の並び(defaultOrder)は、分離レベルを上げるとアノマリーが解消される
 * 様子を既定表示で確認できるよう、アノマリーが再現される順序にしてある。
 * ユーザーはこの順序をドラッグ/キーボードで並べ替えられる(実行開始前のみ)。
 */

function op(partial: OperationDef): OperationDef {
  return partial;
}

const dirtyReadOperations: OperationDef[] = [
  op({
    id: "t1-write",
    txn: "T1",
    kind: "write",
    key: "balance",
    value: { kind: "fixed", value: 50 },
    label: { ja: "T1: balance に 50 を書き込む", en: "T1: write balance = 50" },
  }),
  op({
    id: "t2-read",
    txn: "T2",
    kind: "read",
    key: "balance",
    label: { ja: "T2: balance を読み取る", en: "T2: read balance" },
  }),
  op({
    id: "t2-write",
    txn: "T2",
    kind: "write",
    key: "balance",
    value: { kind: "deriveFromRead", key: "balance", delta: 10 },
    label: { ja: "T2: 読み取った値 + 10 を balance に書き込む", en: "T2: write balance = (value just read) + 10" },
  }),
  op({ id: "t1-commit", txn: "T1", kind: "commit", label: { ja: "T1: コミット", en: "T1: commit" } }),
  op({ id: "t2-commit", txn: "T2", kind: "commit", label: { ja: "T2: コミット", en: "T2: commit" } }),
];

const readSkewOperations: OperationDef[] = [
  op({
    id: "t2-read-a",
    txn: "T2",
    kind: "read",
    key: "accountA",
    label: { ja: "T2: accountA を読み取る", en: "T2: read accountA" },
  }),
  op({
    id: "t1-write-a",
    txn: "T1",
    kind: "write",
    key: "accountA",
    value: { kind: "fixed", value: 400 },
    label: { ja: "T1: accountA から 100 引き落とす", en: "T1: debit 100 from accountA" },
  }),
  op({
    id: "t1-write-b",
    txn: "T1",
    kind: "write",
    key: "accountB",
    value: { kind: "fixed", value: 600 },
    label: { ja: "T1: accountB に 100 入金する", en: "T1: credit 100 to accountB" },
  }),
  op({ id: "t1-commit", txn: "T1", kind: "commit", label: { ja: "T1: コミット", en: "T1: commit" } }),
  op({
    id: "t2-read-b",
    txn: "T2",
    kind: "read",
    key: "accountB",
    label: { ja: "T2: accountB を読み取る", en: "T2: read accountB" },
  }),
  op({ id: "t2-commit", txn: "T2", kind: "commit", label: { ja: "T2: コミット", en: "T2: commit" } }),
];

const writeSkewOperations: OperationDef[] = [
  op({
    id: "t1-read-bob",
    txn: "T1",
    kind: "read",
    key: "bobOnCall",
    label: { ja: "T1(Alice): bobOnCall を確認する", en: "T1 (Alice): read bobOnCall" },
  }),
  op({
    id: "t2-read-alice",
    txn: "T2",
    kind: "read",
    key: "aliceOnCall",
    label: { ja: "T2(Bob): aliceOnCall を確認する", en: "T2 (Bob): read aliceOnCall" },
  }),
  op({
    id: "t1-write-alice",
    txn: "T1",
    kind: "write",
    key: "aliceOnCall",
    value: { kind: "fixed", value: 0 },
    label: { ja: "T1(Alice): aliceOnCall を非番にする", en: "T1 (Alice): set aliceOnCall = off-call" },
  }),
  op({
    id: "t2-write-bob",
    txn: "T2",
    kind: "write",
    key: "bobOnCall",
    value: { kind: "fixed", value: 0 },
    label: { ja: "T2(Bob): bobOnCall を非番にする", en: "T2 (Bob): set bobOnCall = off-call" },
  }),
  op({ id: "t1-commit", txn: "T1", kind: "commit", label: { ja: "T1: コミット", en: "T1: commit" } }),
  op({ id: "t2-commit", txn: "T2", kind: "commit", label: { ja: "T2: コミット", en: "T2: commit" } }),
];

const phantomOperations: OperationDef[] = [
  op({
    id: "t1-read-count",
    txn: "T1",
    kind: "read",
    key: "room101At10Count",
    predicateKey: "predicate:room101At10",
    label: { ja: "T1: Room101 10時の予約件数を確認(0件)", en: "T1: check bookings for Room101 @10:00 (sees 0)" },
  }),
  op({
    id: "t2-read-count",
    txn: "T2",
    kind: "read",
    key: "room101At10Count",
    predicateKey: "predicate:room101At10",
    label: { ja: "T2: Room101 10時の予約件数を確認(0件)", en: "T2: check bookings for Room101 @10:00 (sees 0)" },
  }),
  op({
    id: "t1-insert-booking",
    txn: "T1",
    kind: "write",
    key: "bookingT1",
    value: { kind: "fixed", value: 1 },
    predicateKey: "predicate:room101At10",
    label: { ja: "T1: Room101 10時に予約を1件追加する", en: "T1: insert a booking for Room101 @10:00" },
  }),
  op({
    id: "t2-insert-booking",
    txn: "T2",
    kind: "write",
    key: "bookingT2",
    value: { kind: "fixed", value: 1 },
    predicateKey: "predicate:room101At10",
    label: { ja: "T2: Room101 10時に予約を1件追加する", en: "T2: insert a booking for Room101 @10:00" },
  }),
  op({ id: "t1-commit", txn: "T1", kind: "commit", label: { ja: "T1: コミット", en: "T1: commit" } }),
  op({ id: "t2-commit", txn: "T2", kind: "commit", label: { ja: "T2: コミット", en: "T2: commit" } }),
];

export const PRESETS: Record<PresetId, PresetDefinition> = {
  "dirty-read": {
    id: "dirty-read",
    title: { ja: "ダーティリード", en: "Dirty read" },
    description: {
      ja: "T1がまだコミットしていない書込みを、T2が読み取ってしまわないかを観察する。",
      en: "Observe whether T2 can read a write that T1 has not committed yet.",
    },
    initialStore: { balance: 100 },
    operations: dirtyReadOperations,
    defaultOrder: dirtyReadOperations.map((o) => o.id),
  },
  "read-skew": {
    id: "read-skew",
    title: { ja: "読取りスキュー", en: "Read skew" },
    description: {
      ja: "T2が2つの口座を読む間にT1が送金を完了させ、T2から見た合計額が食い違わないかを観察する。",
      en: "Observe whether T2's view of two accounts becomes inconsistent while T1 completes a transfer in between.",
    },
    initialStore: { accountA: 500, accountB: 500 },
    operations: readSkewOperations,
    defaultOrder: readSkewOperations.map((o) => o.id),
  },
  "write-skew": {
    id: "write-skew",
    title: { ja: "書込みスキュー", en: "Write skew" },
    description: {
      ja: "「最低1名はオンコール」という制約を、互いの状態を確認したT1・T2が同時に破ってしまわないかを観察する。",
      en: "Observe whether the invariant \"at least one person on call\" can be violated when T1 and T2 each check the other before acting.",
    },
    initialStore: { aliceOnCall: 1, bobOnCall: 1 },
    operations: writeSkewOperations,
    defaultOrder: writeSkewOperations.map((o) => o.id),
  },
  phantom: {
    id: "phantom",
    title: { ja: "ファントム", en: "Phantom" },
    description: {
      ja: "同じ会議室・時間帯の予約有無をT1・T2がそれぞれ確認してから追加し、二重予約が生まれないかを観察する。",
      en: "Observe whether a double booking can be created when T1 and T2 each check for existing bookings before inserting one.",
    },
    initialStore: { room101At10Count: 0, bookingT1: 0, bookingT2: 0 },
    operations: phantomOperations,
    defaultOrder: phantomOperations.map((o) => o.id),
  },
};

export const PRESET_IDS: readonly PresetId[] = ["dirty-read", "read-skew", "write-skew", "phantom"];
