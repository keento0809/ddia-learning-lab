export function tumblingWindowSums(
  events: { timestampMs: number; value: number }[],
  windowSizeMs: number,
): { windowStart: number; sum: number; count: number }[] {
  const buckets = new Map<number, { windowStart: number; sum: number; count: number }>();

  for (const event of events) {
    const windowStart = Math.floor(event.timestampMs / windowSizeMs) * windowSizeMs;
    const bucket = buckets.get(windowStart) ?? { windowStart, sum: 0, count: 0 };
    bucket.sum += event.value;
    bucket.count += 1;
    buckets.set(windowStart, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.windowStart - b.windowStart);
}
