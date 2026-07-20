import { describe, expect, it } from "vitest";
import { computeActivityHeatmap } from "@/lib/dashboard/heatmap";
import type { ProgressRecord } from "@/lib/contracts";

/**
 * 03文書T-112受入基準「ヒートマップ型学習カレンダー(直近12週)」の算出ロジック。
 */
function record(overrides: Partial<ProgressRecord>): ProgressRecord {
  return {
    id: "id-1",
    itemType: "lesson",
    itemSlug: "01-reliability/01-intro",
    status: "done",
    score: null,
    completedAt: null,
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeActivityHeatmap", () => {
  const today = new Date("2026-07-20T12:00:00.000Z");

  it("returns exactly 84 days (12 weeks) in ascending date order ending today", () => {
    const days = computeActivityHeatmap([], today);
    expect(days).toHaveLength(84);
    expect(days[0]!.date).toBe("2026-04-28");
    expect(days[83]!.date).toBe("2026-07-20");
  });

  it("counts completed items per UTC day, ignoring in-progress (completedAt=null) items", () => {
    const records: ProgressRecord[] = [
      record({ id: "a", completedAt: "2026-07-20T01:00:00.000Z" }),
      record({ id: "b", completedAt: "2026-07-20T23:00:00.000Z" }),
      record({ id: "c", completedAt: "2026-07-18T00:00:00.000Z" }),
      record({ id: "d", completedAt: null, status: "in_progress" }),
    ];
    const days = computeActivityHeatmap(records, today);
    const byDate = new Map(days.map((day) => [day.date, day.count]));
    expect(byDate.get("2026-07-20")).toBe(2);
    expect(byDate.get("2026-07-18")).toBe(1);
    expect(byDate.get("2026-07-19")).toBe(0);
  });

  it("ignores completions older than the 12-week window", () => {
    const records: ProgressRecord[] = [record({ completedAt: "2025-01-01T00:00:00.000Z" })];
    const days = computeActivityHeatmap(records, today);
    expect(days.every((day) => day.count === 0)).toBe(true);
  });
});
