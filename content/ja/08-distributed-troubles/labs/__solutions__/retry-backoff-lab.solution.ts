export function worstCaseBackoffWaitMs(
  retryCount: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  let total = 0;
  for (let n = 0; n < retryCount; n++) {
    total += Math.min(baseDelayMs * 2 ** n, maxDelayMs);
  }
  return total;
}
