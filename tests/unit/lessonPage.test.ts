import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { buildLessonPageData } from "@/lib/lessonPage";
import type { ModuleDetailSummary } from "@/lib/moduleDetail";

/**
 * 03文書T-103の前後アイテム導線(前へ/次へ)を、T-102で確立済みのフィクスチャ
 * (tests/fixtures/moduleDetail)に対して検証する。
 */
const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/moduleDetail", import.meta.url));

function loadDetail(locale: Locale, moduleSlug: string): ModuleDetailSummary {
  const mod = loadAllModules(FIXTURES_ROOT, locale).find((m) => m.slug === moduleSlug);
  if (!mod) throw new Error(`fixture module not found: ${moduleSlug}`);
  return {
    meta: mod.meta,
    lessons: mod.lessons.map((lesson) => ({
      id: lesson.slug.split("/").slice(1).join("/"),
      title: lesson.frontmatter.title,
      order: lesson.frontmatter.order,
      minutes: lesson.frontmatter.minutes,
    })),
    hasQuiz: mod.quizFilePath !== null,
    exercises: mod.exercises.map((exercise) => ({ slug: exercise.slug })),
  };
}

describe("buildLessonPageData", () => {
  it("先頭レッスンには前へがなく、次へは目次の次アイテムを指す", () => {
    const detail = loadDetail("ja", "01-reliability");
    const data = buildLessonPageData("01-reliability", "01-intro", detail);

    expect(data).toBeDefined();
    expect(data?.lessonTitle).toBe("はじめに");
    expect(data?.prevHref).toBeNull();
    expect(data?.nextHref).toBe("/learn/01-reliability/02-percentiles");
  });

  it("中間のレッスンは前へ・次への両方を持つ", () => {
    const detail = loadDetail("ja", "01-reliability");
    const data = buildLessonPageData("01-reliability", "02-percentiles", detail);

    expect(data?.prevHref).toBe("/learn/01-reliability/01-intro");
    // 02-percentilesの次はquiz(quiz.yamlが存在するフィクスチャのため)
    expect(data?.nextHref).toBe("/learn/01-reliability/quiz");
  });

  it("存在しないlessonIdの場合はundefinedを返す(呼び出し側でnotFound())", () => {
    const detail = loadDetail("ja", "01-reliability");
    expect(buildLessonPageData("01-reliability", "does-not-exist", detail)).toBeUndefined();
  });

  it("英語ロケールでも同様に解決できる", () => {
    const detail = loadDetail("en", "01-reliability");
    const data = buildLessonPageData("01-reliability", "01-intro", detail);
    expect(data?.lessonTitle).toBe("Introduction");
    expect(data?.nextHref).toBe("/learn/01-reliability/02-percentiles");
  });
});
