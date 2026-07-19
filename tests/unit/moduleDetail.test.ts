import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import {
  buildModuleToc,
  nextItemHref,
  tocItemHref,
  tocItemKey,
  tocItemSlug,
  type ModuleDetailSummary,
} from "@/lib/moduleDetail";

/**
 * 03文書T-102 受入基準の一部(「フィクスチャに対する描画テスト」の前提となる
 * 目次組み立て/次アイテム導線ロジック)。実際のfs読み込みは`lib/content.ts`
 * (T-006で確立済み)を再利用し、`tests/fixtures/moduleDetail/`のフィクスチャで検証する。
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

describe("buildModuleToc", () => {
  it.each([["ja"], ["en"]] as const)(
    "orders lessons (by frontmatter order) then quiz then exercises (locale=%s)",
    (locale) => {
      const detail = loadDetail(locale, "01-reliability");
      const toc = buildModuleToc(detail);

      expect(toc.map((item) => item.kind)).toEqual(["lesson", "lesson", "quiz", "exercise"]);
      expect(toc.map((item) => (item.kind === "lesson" ? item.id : null))).toEqual([
        "01-intro",
        "02-percentiles",
        null,
        null,
      ]);
    },
  );

  it("sorts lessons by frontmatter order even when input order differs", () => {
    const detail = loadDetail("ja", "01-reliability");
    const shuffled: ModuleDetailSummary = { ...detail, lessons: [...detail.lessons].reverse() };

    const toc = buildModuleToc(shuffled);

    expect(toc.filter((item) => item.kind === "lesson").map((item) => item.id)).toEqual([
      "01-intro",
      "02-percentiles",
    ]);
  });

  it("returns an empty list for a module with no lessons/quiz/exercises", () => {
    const detail = loadDetail("ja", "02-empty");

    expect(buildModuleToc(detail)).toEqual([]);
  });
});

describe("tocItemHref / tocItemKey", () => {
  it("builds lesson/quiz/exercise hrefs relative to the module", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);

    expect(toc.map((item) => tocItemHref("01-reliability", item))).toEqual([
      "/learn/01-reliability/01-intro",
      "/learn/01-reliability/02-percentiles",
      "/learn/01-reliability/quiz",
      "/learn/01-reliability/lab/percentile-lab",
    ]);
  });

  it("produces unique keys per item", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);

    const keys = toc.map(tocItemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("nextItemHref", () => {
  it("points to the first TOC item (lesson) when the module has content", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);

    expect(nextItemHref("01-reliability", toc)).toBe("/learn/01-reliability/01-intro");
  });

  it("returns null when the module has no lessons/quiz/exercises", () => {
    const detail = loadDetail("ja", "02-empty");
    const toc = buildModuleToc(detail);

    expect(nextItemHref("02-empty", toc)).toBeNull();
  });

  it("T-105: skips done items and resumes at the first non-done item when doneSlugs is given", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);
    const doneSlugs = new Set(["01-reliability/01-intro"]);

    expect(nextItemHref("01-reliability", toc, doneSlugs)).toBe(
      "/learn/01-reliability/02-percentiles",
    );
  });

  it("T-105: falls back to the first TOC item when every item is done", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);
    const doneSlugs = new Set(toc.map((item) => tocItemSlug("01-reliability", item)));

    expect(nextItemHref("01-reliability", toc, doneSlugs)).toBe("/learn/01-reliability/01-intro");
  });
});

describe("tocItemSlug", () => {
  it("builds the PUT/GET /api/progress itemSlug for each TOC item kind", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);

    expect(toc.map((item) => tocItemSlug("01-reliability", item))).toEqual([
      "01-reliability/01-intro",
      "01-reliability/02-percentiles",
      "01-reliability/quiz",
      "percentile-lab",
    ]);
  });
});
