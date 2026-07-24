/**
 * 決定的疑似乱数生成器(mulberry32)。SimEngineへのシード注入により、
 * 同一シードから同一の乱数列(ひいては同一の状態遷移列)を再現可能にする。
 * 参照設計: docs/design/02_詳細設計書.md §8.1 SimEngine「決定的乱数注入」。
 */
export type RandomSource = () => number;

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
