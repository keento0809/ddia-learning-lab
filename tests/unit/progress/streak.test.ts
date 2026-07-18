import { describe, expect, it } from "vitest";
import { advanceStreak, isValidTimeZone, todayInTimeZone } from "@/lib/progress/streak";

/** 03文書T-104「ストリーク更新ロジック」の純粋関数単体テスト */
describe("advanceStreak", () => {
  it("初回アクティブ(lastActiveDateなし)はcurrentDays=1で初期化する", () => {
    const result = advanceStreak(
      { currentDays: 0, longestDays: 0, lastActiveDate: null },
      "2026-07-19",
    );
    expect(result).toEqual({ currentDays: 1, longestDays: 1, lastActiveDate: "2026-07-19" });
  });

  it("同日内の再呼び出しは冪等(状態を変えない)", () => {
    const state = { currentDays: 3, longestDays: 5, lastActiveDate: "2026-07-19" };
    expect(advanceStreak(state, "2026-07-19")).toEqual(state);
  });

  it("前日の翌日はcurrentDaysを+1しlongestDaysを更新する", () => {
    const result = advanceStreak(
      { currentDays: 3, longestDays: 5, lastActiveDate: "2026-07-18" },
      "2026-07-19",
    );
    expect(result).toEqual({ currentDays: 4, longestDays: 5, lastActiveDate: "2026-07-19" });
  });

  it("currentDaysがlongestDaysを超えたらlongestDaysも更新する", () => {
    const result = advanceStreak(
      { currentDays: 5, longestDays: 5, lastActiveDate: "2026-07-18" },
      "2026-07-19",
    );
    expect(result).toEqual({ currentDays: 6, longestDays: 6, lastActiveDate: "2026-07-19" });
  });

  it("2日以上の空白があった場合は1にリセットする", () => {
    const result = advanceStreak(
      { currentDays: 10, longestDays: 12, lastActiveDate: "2026-07-10" },
      "2026-07-19",
    );
    expect(result).toEqual({ currentDays: 1, longestDays: 12, lastActiveDate: "2026-07-19" });
  });

  it("日付が巻き戻った(不正な)場合も1にリセットする", () => {
    const result = advanceStreak(
      { currentDays: 4, longestDays: 4, lastActiveDate: "2026-07-19" },
      "2026-07-18",
    );
    expect(result).toEqual({ currentDays: 1, longestDays: 4, lastActiveDate: "2026-07-18" });
  });
});

describe("todayInTimeZone", () => {
  it("UTC日付を指定タイムゾーンでのYYYY-MM-DDへ変換する(日付が変わる境界)", () => {
    // 2026-07-19T23:30:00Z はAsia/Tokyo(UTC+9)では既に2026-07-20
    const now = new Date("2026-07-19T23:30:00Z");
    expect(todayInTimeZone("Asia/Tokyo", now)).toBe("2026-07-20");
    expect(todayInTimeZone("UTC", now)).toBe("2026-07-19");
  });
});

describe("isValidTimeZone", () => {
  it("有効なIANAタイムゾーンはtrueを返す", () => {
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("無効な文字列はfalseを返す", () => {
    expect(isValidTimeZone("Not/A/TimeZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
