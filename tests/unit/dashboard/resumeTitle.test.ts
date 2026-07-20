import { describe, expect, it } from "vitest";
import {
  resolveResumeDisplayFromDetail,
  resolveResumeHref,
  splitItemSlug,
} from "@/lib/dashboard/resumeTitle";
import type { ModuleDetailSummary } from "@/lib/moduleDetail";

/** 03文書T-112「続きから再開」カードのタイトル/リンク解決ロジック */
const DETAIL: ModuleDetailSummary = {
  meta: { slug: "01-reliability", title: "信頼性", order: 1, minutes: 30 },
  lessons: [
    { id: "01-load-and-performance", title: "負荷とパフォーマンス", order: 1, minutes: 15 },
    { id: "02-percentiles", title: "パーセンタイル", order: 2, minutes: 15 },
  ],
  hasQuiz: true,
  exercises: [{ slug: "01-reliability/percentile-lab" }],
};

describe("splitItemSlug", () => {
  it("splits on the first slash", () => {
    expect(splitItemSlug("01-reliability/02-percentiles")).toEqual({
      moduleSlug: "01-reliability",
      rest: "02-percentiles",
    });
  });

  it("treats a slug without a slash as module-only", () => {
    expect(splitItemSlug("01-reliability")).toEqual({ moduleSlug: "01-reliability", rest: "" });
  });
});

describe("resolveResumeDisplayFromDetail", () => {
  it("resolves the lesson title and module title from the looked-up detail", () => {
    const display = resolveResumeDisplayFromDetail(
      "lesson",
      "01-reliability/02-percentiles",
      DETAIL,
    );
    expect(display).toEqual({ moduleTitle: "信頼性", lessonTitle: "パーセンタイル" });
  });

  it("returns lessonTitle=null for quiz (no title field in the data model)", () => {
    const display = resolveResumeDisplayFromDetail("quiz", "01-reliability/quiz", DETAIL);
    expect(display).toEqual({ moduleTitle: "信頼性", lessonTitle: null });
  });

  it("returns lessonTitle=null for exercise (ExerciseDefinition has no title field)", () => {
    const display = resolveResumeDisplayFromDetail(
      "exercise",
      "01-reliability/percentile-lab",
      DETAIL,
    );
    expect(display).toEqual({ moduleTitle: "信頼性", lessonTitle: null });
  });

  it("falls back to the module slug when no detail was found (unknown module)", () => {
    const display = resolveResumeDisplayFromDetail("lesson", "99-unknown/01-x", undefined);
    expect(display).toEqual({ moduleTitle: "99-unknown", lessonTitle: null });
  });
});

describe("resolveResumeHref", () => {
  it("builds a lesson href", () => {
    expect(resolveResumeHref("lesson", "01-reliability/02-percentiles")).toBe(
      "/learn/01-reliability/02-percentiles",
    );
  });

  it("builds a quiz href", () => {
    expect(resolveResumeHref("quiz", "01-reliability/quiz")).toBe("/learn/01-reliability/quiz");
  });

  it("builds an exercise href", () => {
    expect(resolveResumeHref("exercise", "01-reliability/percentile-lab")).toBe(
      "/learn/01-reliability/lab/01-reliability/percentile-lab",
    );
  });
});
