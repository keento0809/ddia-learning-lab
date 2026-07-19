import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import type { ProgressRecord } from "@/lib/contracts";
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

  /**
   * T-105受入基準「S-02/S-03への進捗オーバーレイ(進捗リング)が実データで
   * 表示される」。progressを注入した場合に、完了/進行中の各TOC行へ状態表示が
   * 付き、次アイテム導線が「完了済みでない最初のアイテム」(in_progressの
   * 02-percentilesはスキップしない)へ切り替わり、進捗リングの割合が
   * 実データ(4アイテム中1件done=25%)を反映することを検証する。
   */
  it("overlays real progress data: per-item status, resume CTA, and ring percent", () => {
    const detail = loadDetail("ja", "01-reliability");
    const progress: ProgressRecord[] = [
      {
        id: "p1",
        itemType: "lesson",
        itemSlug: "01-reliability/01-intro",
        status: "done",
        score: null,
        completedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "p2",
        itemType: "lesson",
        itemSlug: "01-reliability/02-percentiles",
        status: "in_progress",
        score: null,
        completedAt: null,
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        {ModuleDetail({ locale: "ja", detail, progress })}
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-testid="module-toc-status-lesson-01-intro"');
    expect(html).toContain("完了");
    expect(html).toContain('data-testid="module-toc-status-lesson-02-percentiles"');
    expect(html).toContain("進行中");
    expect(html).not.toContain('data-testid="module-toc-status-quiz"');
    // done(01-intro)はスキップし、in_progress(02-percentiles、未完了)へ導線が向く
    expect(html).toContain('data-testid="module-detail-next-item"');
    expect(html).toContain('href="/ja/learn/01-reliability/02-percentiles"');
    // 4アイテム(lesson×2, quiz, exercise)中1件done = 25%
    expect(html).toContain('aria-label="進捗 25%"');
  });
});
