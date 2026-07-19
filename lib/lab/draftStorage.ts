/**
 * ドラフト自動保存(T-108, 02§4.2「localStorage(key: draft:{exerciseSlug}:{lang})へ
 * 1s debounce」)。言語(lang)ごとに別キーで保存する(演習テンプレートのコメントが
 * 言語別のため、ja/enで別々の下書きになりうる)。
 *
 * 言語切替中の即時保持(02§5.1「エディタ内容・実行結果はZustandに保持」)は
 * lib/store/labStore.ts側のメモリ上の状態(slugのみで keyed)が担う。
 * localStorageはリロード/再訪問をまたぐ永続化専用。
 */

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function draftStorageKey(exerciseSlug: string, lang: string): string {
  return `draft:${exerciseSlug}:${lang}`;
}

export function readDraft(
  exerciseSlug: string,
  lang: string,
  storage: StorageLike | null = defaultStorage(),
): string | null {
  if (!storage) return null;
  return storage.getItem(draftStorageKey(exerciseSlug, lang));
}

export function writeDraft(
  exerciseSlug: string,
  lang: string,
  code: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(draftStorageKey(exerciseSlug, lang), code);
}
