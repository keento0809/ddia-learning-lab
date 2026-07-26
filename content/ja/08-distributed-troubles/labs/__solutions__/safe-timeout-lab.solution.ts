export function computeSafeTimeoutMs(
  p99RttMs: number,
  maxClockDriftMs: number,
  safetyMarginMs: number,
): number {
  return p99RttMs + maxClockDriftMs * 2 + safetyMarginMs;
}
