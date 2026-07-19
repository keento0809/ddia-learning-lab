// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { GuestProgressEntry } from "@/lib/contracts";
import {
  GUEST_PROGRESS_STORAGE_KEY,
  clearGuestProgress,
  hasGuestProgress,
  mergeGuestProgressEntry,
  readGuestProgress,
  recordGuestProgress,
} from "@/lib/progress/guestProgress";

/**
 * T-113受入基準「マージロジックのテーブル駆動テスト(両方done/片方のみ/競合)」。
 * mergeGuestProgressEntryはlib/progress/guestProgress.ts(クライアント側)と
 * app/api/guest-progress/import/route.ts(サーバ側)の両方が使う単一の実装。
 */
describe("mergeGuestProgressEntry (T-113 done優先マージ)", () => {
  const cases: {
    name: string;
    existing: GuestProgressEntry | undefined;
    incoming: GuestProgressEntry;
    expected: GuestProgressEntry;
  }[] = [
    {
      name: "両方done: statusはdoneのまま、scoreは高い方を採用",
      existing: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "done", score: 70 },
      incoming: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "done", score: 90 },
      expected: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "done", score: 90 },
    },
    {
      name: "片方のみdone(既存in_progress→取り込みdone): 結果はdone、scoreは取り込み側",
      existing: { itemType: "quiz", itemSlug: "01-reliability/quiz", status: "in_progress" },
      incoming: { itemType: "quiz", itemSlug: "01-reliability/quiz", status: "done", score: 100 },
      expected: { itemType: "quiz", itemSlug: "01-reliability/quiz", status: "done", score: 100 },
    },
    {
      name: "片方のみdone(既存done→取り込みin_progress): 結果はdoneのまま後退しない",
      existing: { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" },
      incoming: { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "in_progress" },
      expected: { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" },
    },
    {
      name: "競合(両方in_progress、score不一致): statusはin_progressのまま、scoreは高い方",
      existing: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "in_progress", score: 40 },
      incoming: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "in_progress", score: 60 },
      expected: { itemType: "exercise", itemSlug: "06-partitioning/consistent-hash", status: "in_progress", score: 60 },
    },
    {
      name: "既存なし: 取り込み側をそのまま採用",
      existing: undefined,
      incoming: { itemType: "lesson", itemSlug: "01-reliability/02-percentiles", status: "in_progress" },
      expected: { itemType: "lesson", itemSlug: "01-reliability/02-percentiles", status: "in_progress" },
    },
  ];

  it.each(cases)("$name", ({ existing, incoming, expected }) => {
    expect(mergeGuestProgressEntry(existing, incoming)).toEqual(expected);
  });
});

describe("guestProgress localStorage helpers (T-113)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("読み書き: 空の場合は[]、書き込み後は読み出せる", () => {
    expect(readGuestProgress()).toEqual([]);
    expect(hasGuestProgress()).toBe(false);

    recordGuestProgress({ itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "in_progress" });

    expect(hasGuestProgress()).toBe(true);
    expect(readGuestProgress()).toEqual([
      { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "in_progress" },
    ]);
  });

  it("同一itemへの再記録はdone優先マージされ、別itemは追加される", () => {
    recordGuestProgress({ itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "in_progress" });
    recordGuestProgress({ itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" });
    recordGuestProgress({ itemType: "lesson", itemSlug: "01-reliability/02-percentiles", status: "in_progress" });

    expect(readGuestProgress()).toEqual([
      { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" },
      { itemType: "lesson", itemSlug: "01-reliability/02-percentiles", status: "in_progress" },
    ]);
  });

  it("clearGuestProgressでlocalStorageのキー自体が削除される", () => {
    recordGuestProgress({ itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" });
    clearGuestProgress();

    expect(window.localStorage.getItem(GUEST_PROGRESS_STORAGE_KEY)).toBeNull();
    expect(readGuestProgress()).toEqual([]);
  });

  it("壊れたJSONやスキーマ不一致のデータは無視して[]を返す", () => {
    window.localStorage.setItem(GUEST_PROGRESS_STORAGE_KEY, "not-json");
    expect(readGuestProgress()).toEqual([]);

    window.localStorage.setItem(GUEST_PROGRESS_STORAGE_KEY, JSON.stringify([{ foo: "bar" }]));
    expect(readGuestProgress()).toEqual([]);
  });
});
