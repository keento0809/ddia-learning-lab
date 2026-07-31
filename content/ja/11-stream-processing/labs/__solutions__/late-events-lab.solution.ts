type LateEvent = { id: string; eventTimeMs: number; value: number };
type WindowResult = { windowStart: number; sum: number; count: number };

export function aggregateWithWatermark(
  events: LateEvent[],
  windowSizeMs: number,
  allowedLatenessMs: number,
): { windows: WindowResult[]; lateEventIds: string[] } {
  const buckets = new Map<number, WindowResult>();
  const lateEventIds: string[] = [];
  let maxEventTimeSeenMs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    const watermarkMs = maxEventTimeSeenMs - allowedLatenessMs;
    const windowStart = Math.floor(event.eventTimeMs / windowSizeMs) * windowSizeMs;
    const windowEnd = windowStart + windowSizeMs;

    if (watermarkMs >= windowEnd) {
      lateEventIds.push(event.id);
    } else {
      const bucket = buckets.get(windowStart) ?? { windowStart, sum: 0, count: 0 };
      bucket.sum += event.value;
      bucket.count += 1;
      buckets.set(windowStart, bucket);
    }

    maxEventTimeSeenMs = Math.max(maxEventTimeSeenMs, event.eventTimeMs);
  }

  const windows = [...buckets.values()].sort((a, b) => a.windowStart - b.windowStart);
  return { windows, lateEventIds };
}
