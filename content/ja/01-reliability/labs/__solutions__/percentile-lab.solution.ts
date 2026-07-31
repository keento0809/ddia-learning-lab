export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[index];
}

export function worstOfConcurrentCalls(callLatenciesPerRequest: number[][]): number[] {
  return callLatenciesPerRequest.map((calls) => Math.max(...calls));
}
