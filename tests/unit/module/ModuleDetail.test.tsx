import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { ModuleDetail } from "@/components/module/ModuleDetail";
import type { ModuleDetailSummary } from "@/lib/moduleDetail";

/**
 * 03文書T-102 受入基準「フィクスチャに対する描画テスト」。
 * components/curriculum/CurriculumList.test.tsxで確立済みのパターン
 * (フックを使わない関数コンポーネントを直接呼び出す)を踏襲する。
 */
const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/moduleDetail", import.meta.url));

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

describe("ModuleDetail", () => {
  it.each([["ja"], ["en"]] as const)(
    "renders lessons/quiz/exercise TOC, total minutes and next-item CTA (locale=%s)",
    (locale) => {
      const detail = loadDetail(locale, "01-reliability");
      const result = ModuleDetail({ locale, detail });

      expect(result).toMatchSnapshot();
    },
  );

  it.each([["ja"], ["en"]] as const)(
    "renders the empty state and no next-item CTA when the module has no items (locale=%s)",
    (locale) => {
      const detail = loadDetail(locale, "02-empty");
      const result = ModuleDetail({ locale, detail });

      expect(result).toMatchSnapshot();
    },
  );
});
