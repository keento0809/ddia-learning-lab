import { describe, expect, it } from "vitest";
import { computeCurriculumProgress } from "@/lib/progress/moduleProgress";
import type { CurriculumModuleSummary } from "@/lib/curriculum";
import type { ProgressRecord } from "@/lib/contracts";

/**
 * T-105受入基準「S-02...への進捗オーバーレイ(進捗リング)が実データで表示
 * される」。S-02(CurriculumListWithProgress)向けの進捗率算出ロジックの
 * 単体テスト。lessonCountのみを分母とする(02文書のprops注入は
 * ModuleCard/ProgressRingで既に確立済み、実データ化がT-105のスコープ)。
 */
function record(overrides: Partial<ProgressRecord> & Pick<ProgressRecord, "itemSlug">): ProgressRecord {
  return {
    id: `id-${overrides.itemSlug}`,
    itemType: "lesson",
    status: "done",
    score: null,
    completedAt: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function moduleSummary(slug: string, lessonCount: number): CurriculumModuleSummary {
  return {
    meta: { slug, title: slug, order: 1, minutes: 10 },
    lessonCount,
  };
}

describe("computeCurriculumProgress", () => {
  it("computes percent done from lesson-type records matching the module prefix", () => {
    const modules = [moduleSummary("01-reliability", 4)];
    const records = [
      record({ itemSlug: "01-reliability/01-intro", status: "done" }),
      record({ itemSlug: "01-reliability/02-percentiles", status: "done" }),
      record({ itemSlug: "01-reliability/03-x", status: "in_progress" }),
    ];

    expect(computeCurriculumProgress(modules, records)).toEqual([
      { slug: "01-reliability", percent: 50 },
    ]);
  });

  it("returns 0% for a module with no lessons (avoids division by zero)", () => {
    const modules = [moduleSummary("02-empty", 0)];

    expect(computeCurriculumProgress(modules, [])).toEqual([{ slug: "02-empty", percent: 0 }]);
  });

  it("does not let a module with a similar slug prefix leak into another module's count", () => {
    const modules = [moduleSummary("01-x", 2), moduleSummary("01-x-extended", 2)];
    const records = [record({ itemSlug: "01-x-extended/01-intro", status: "done" })];

    expect(computeCurriculumProgress(modules, records)).toEqual([
      { slug: "01-x", percent: 0 },
      { slug: "01-x-extended", percent: 50 },
    ]);
  });

  it("ignores non-lesson item types (quiz/exercise) when computing the module ring", () => {
    const modules = [moduleSummary("01-reliability", 2)];
    const records = [
      record({ itemSlug: "01-reliability/quiz", itemType: "quiz", status: "done" }),
      record({ itemSlug: "percentile-lab", itemType: "exercise", status: "done" }),
    ];

    expect(computeCurriculumProgress(modules, records)).toEqual([
      { slug: "01-reliability", percent: 0 },
    ]);
  });
});
