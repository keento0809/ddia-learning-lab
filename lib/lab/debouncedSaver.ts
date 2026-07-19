/**
 * 1s debounce保存トリガー(02§4.2「localStorageへ1s debounce」)の純粋実装。
 * setTimeout/clearTimeoutのみに依存するためDOM無しで単体テスト可能
 * (vi.useFakeTimers()で決定的に検証する)。
 */
export const DRAFT_AUTOSAVE_DEBOUNCE_MS = 1000;

export interface DebouncedSaver<T> {
  trigger: (value: T) => void;
  cancel: () => void;
}

export function createDebouncedSaver<T>(
  save: (value: T) => void,
  delayMs: number = DRAFT_AUTOSAVE_DEBOUNCE_MS,
): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    trigger(value: T) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        save(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
