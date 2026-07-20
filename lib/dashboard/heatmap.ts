import type { ProgressRecord } from "@/lib/contracts";

export interface HeatmapDay {
  /** UTC日付(YYYY-MM-DD) */
  date: string;
  count: number;
}

const WEEKS = 12;
const DAYS_IN_HEATMAP = WEEKS * 7;
const DAY_MS = 86_400_000;

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * S-07「ヒートマップ型学習カレンダー(直近12週)」(02§4.4)向け。
 * GET /api/progress の completedAt(既存フィールド、変更なし)を日別に集計する。
 * GetDashboardResponseSchema(lib/contracts、変更禁止)には日別活動データが
 * 無いため、既にクライアントが保持しているGET /api/progressの結果から算出する
 * (新規APIフィールドを必要としない)。
 */
export function computeActivityHeatmap(
  records: readonly ProgressRecord[],
  today: Date = new Date(),
): HeatmapDay[] {
  const utcTodayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const countsByDate = new Map<string, number>();
  for (const record of records) {
    if (!record.completedAt) continue;
    const key = toUtcDateKey(new Date(record.completedAt));
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const days: HeatmapDay[] = [];
  for (let offset = DAYS_IN_HEATMAP - 1; offset >= 0; offset -= 1) {
    const key = toUtcDateKey(new Date(utcTodayMs - offset * DAY_MS));
    days.push({ date: key, count: countsByDate.get(key) ?? 0 });
  }
  return days;
}
