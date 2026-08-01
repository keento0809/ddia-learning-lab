import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import {
  getFreeTierModuleSlug,
  groupModulesByPart,
  partForOrder,
  type CurriculumModuleSummary,
} from "@/lib/curriculum";

const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/curriculum", import.meta.url));

function loadFixtureSummaries(locale: Locale): CurriculumModuleSummary[] {
  return loadAllModules(FIXTURES_ROOT, locale).map((mod) => ({
    meta: mod.meta,
    lessonCount: mod.lessons.length,
  }));
}

describe("partForOrder", () => {
  it("maps module order 1-4 to Part I, 5-9 to Part II, 10-12 to Part III", () => {
    expect([1, 2, 3, 4].map(partForOrder)).toEqual(["I", "I", "I", "I"]);
    expect([5, 6, 7, 8, 9].map(partForOrder)).toEqual(["II", "II", "II", "II", "II"]);
    expect([10, 11, 12].map(partForOrder)).toEqual(["III", "III", "III"]);
  });
});

describe("groupModulesByPart", () => {
  it("orders modules by `order` ascending regardless of input order", () => {
    const reversed = [...loadFixtureSummaries("ja")].reverse();
    const grouped = groupModulesByPart(reversed);

    expect(grouped.I.map((m) => m.meta.order)).toEqual([1, 2, 3, 4]);
    expect(grouped.II.map((m) => m.meta.order)).toEqual([5, 6, 7, 8, 9]);
    expect(grouped.III.map((m) => m.meta.order)).toEqual([10, 11, 12]);
  });
});

describe("12-module fixture loads in order for both locales", () => {
  it.each([["ja"], ["en"]] as const)("locale=%s", (locale) => {
    const summaries = loadFixtureSummaries(locale);

    expect(summaries).toHaveLength(12);
    expect(summaries.map((m) => m.meta.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(summaries.map((m) => m.meta.slug)).toEqual([
      "01-reliability",
      "02-data-models",
      "03-storage-and-indexing",
      "04-encoding",
      "05-replication",
      "06-partitioning",
      "07-transactions",
      "08-distributed-troubles",
      "09-consistency-and-consensus",
      "10-batch-processing",
      "11-stream-processing",
      "12-capstone-design",
    ]);
    // module 1 has one lesson fixture; the rest have none.
    expect(summaries[0].lessonCount).toBe(1);
    expect(summaries.slice(1).every((m) => m.lessonCount === 0)).toBe(true);
  });
});

/**
 * T-603(ADR-009 §3.2「モジュール1は登録なしで全部読めます」導線)。
 * ビルド生成物(lib/generated/curriculum.*.json)に対して検証する
 * (tests/unit/lessonAccess.test.tsと同じ、実データ依存ロジックのため)。
 */
describe("getFreeTierModuleSlug", () => {
  it.each([["ja"], ["en"]] as const)(
    "returns the slug of the order-1 module (01-reliability, locale=%s)",
    (locale) => {
      expect(getFreeTierModuleSlug(locale)).toBe("01-reliability");
    },
  );
});
