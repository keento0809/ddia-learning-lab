import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { CurriculumList } from "@/components/curriculum/CurriculumList";
import type { CurriculumModuleSummary } from "@/lib/curriculum";

/**
 * 03文書T-101 受入基準「フィクスチャ12モジュールが順序どおり両言語で描画される
 * スナップショットテスト」。components/auth/OAuthButtons.tsxで確立済みの
 * パターン(フックを使わない関数コンポーネントを直接呼び出す)を踏襲する。
 */
const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/curriculum", import.meta.url));

function loadFixtureSummaries(locale: Locale): CurriculumModuleSummary[] {
  // フィクスチャのディレクトリ列挙順(01..12)をそのまま信用せず、意図的に
  // シャッフルしてからCurriculumListに渡し、order順ソートが描画側の
  // 責務であることを検証する。
  const summaries = loadAllModules(FIXTURES_ROOT, locale).map((mod) => ({
    meta: mod.meta,
    lessonCount: mod.lessons.length,
  }));
  const [first, ...rest] = summaries;
  return first ? [...rest, first] : summaries;
}

describe("CurriculumList", () => {
  it.each([["ja"], ["en"]] as const)(
    "renders 12 fixture modules grouped by Part, in order (locale=%s)",
    (locale) => {
      const modules = loadFixtureSummaries(locale);
      const result = CurriculumList({ locale, modules });

      expect(result).toMatchSnapshot();
    },
  );

  /**
   * T-603(ADR-009 §3.2)。未認証時はFree Tier(モジュール1、order===1)以外に
   * 鍵アイコンが表示され、認証済みでは一切表示されないこと(受入基準(4)(5))を
   * DOM出力で検証する。
   */
  it("shows a lock icon only on non-Free-Tier modules when unauthenticated", () => {
    const modules = loadFixtureSummaries("ja");
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        {CurriculumList({ locale: "ja", modules, isAuthenticated: false })}
      </NextIntlClientProvider>,
    );

    expect(html).not.toContain('data-testid="curriculum-module-lock-01-reliability"');
    for (const slug of modules.map((m) => m.meta.slug).filter((slug) => slug !== "01-reliability")) {
      expect(html).toContain(`data-testid="curriculum-module-lock-${slug}"`);
    }
  });

  it("shows no lock icons at all when authenticated", () => {
    const modules = loadFixtureSummaries("ja");
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        {CurriculumList({ locale: "ja", modules, isAuthenticated: true })}
      </NextIntlClientProvider>,
    );

    expect(html).not.toContain("curriculum-module-lock-");
  });
});
