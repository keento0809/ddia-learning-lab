import { z } from "zod";
import { GuestProgressEntrySchema, type GuestProgressEntry, type ProgressStatus } from "@/lib/contracts";

/**
 * ゲスト進捗(T-113)。02§6状態管理詳細「ゲスト進捗 | localStorage(`guest-progress`
 * 配列) | ログイン時 POST /api/guest-progress/import でマージ(サーバ側はdone
 * 優先で統合)」。未ログイン中の進捗をこのモジュールでlocalStorageへ書き込み、
 * 初回ログイン時にlib/progress/useGuestProgressImport.tsが読み出してサーバへ送る。
 */
export const GUEST_PROGRESS_STORAGE_KEY = "guest-progress";

const GuestProgressListSchema = z.array(GuestProgressEntrySchema);

/**
 * done優先マージ。02§6「サーバ側はdone優先で統合」に対応する純粋関数で、
 * クライアント側(このファイル、同一ブラウザでの再訪問時の重複排除)と
 * サーバ側(app/api/guest-progress/import/route.ts、既存DB行との統合)の
 * 両方から使う単一の実装(T-113受入基準「マージロジックのテーブル駆動
 * テスト」が対象とする関数)。
 *
 * ルール: (1) どちらかがdoneなら結果はdone(両方done/片方のみdoneのいずれも)。
 * (2) 両方がin_progressの場合(競合)はin_progressのまま。
 * (3) scoreは両方に値があれば大きい方(より良い結果)、片方のみなら
 * そちらの値を採用する。
 */
export function mergeGuestProgressEntry(
  existing: GuestProgressEntry | undefined,
  incoming: GuestProgressEntry,
): GuestProgressEntry {
  if (!existing) {
    return incoming;
  }
  const status: ProgressStatus =
    existing.status === "done" || incoming.status === "done" ? "done" : "in_progress";
  const score = mergeScore(existing.score, incoming.score);
  return {
    itemType: incoming.itemType,
    itemSlug: incoming.itemSlug,
    status,
    ...(score !== undefined ? { score } : {}),
  };
}

function mergeScore(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** localStorageの`guest-progress`配列を読み出す。壊れた/存在しない場合は空配列 */
export function readGuestProgress(): GuestProgressEntry[] {
  const storage = readStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(GUEST_PROGRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = GuestProgressListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeGuestProgress(entries: GuestProgressEntry[]): void {
  const storage = readStorage();
  if (!storage) return;
  storage.setItem(GUEST_PROGRESS_STORAGE_KEY, JSON.stringify(entries));
}

/** ログイン前の進捗記録(F-17)。既存エントリがあればdone優先マージして上書きする */
export function recordGuestProgress(entry: GuestProgressEntry): void {
  const existing = readGuestProgress();
  const index = existing.findIndex(
    (item) => item.itemType === entry.itemType && item.itemSlug === entry.itemSlug,
  );
  const merged = index === -1 ? entry : mergeGuestProgressEntry(existing[index], entry);
  const next =
    index === -1 ? [...existing, merged] : existing.map((item, i) => (i === index ? merged : item));
  writeGuestProgress(next);
}

/** 初回ログイン時のインポート成功後に呼び、localStorageの`guest-progress`を消去する */
export function clearGuestProgress(): void {
  const storage = readStorage();
  storage?.removeItem(GUEST_PROGRESS_STORAGE_KEY);
}

export function hasGuestProgress(): boolean {
  return readGuestProgress().length > 0;
}
