/**
 * ヒント段階開放(T-108, 02§4.2「ヒントは段階開放(失敗2回で Hint1、5回で Hint2)」)。
 * 「失敗」は合格(pass)以外の実行結果すべて(fail/timeout/runtime_error)を指す
 * (タイムアウトや実行時エラーで詰まっている受講者にもヒントを提供するため)。
 */
export const HINT_1_THRESHOLD = 2;
export const HINT_2_THRESHOLD = 5;

/** failCountとヒント総数から、現在開放されているヒント件数を返す。 */
export function revealedHintCount(failCount: number, totalHints: number): number {
  if (totalHints <= 0) return 0;
  if (failCount >= HINT_2_THRESHOLD) return Math.min(2, totalHints);
  if (failCount >= HINT_1_THRESHOLD) return Math.min(1, totalHints);
  return 0;
}
