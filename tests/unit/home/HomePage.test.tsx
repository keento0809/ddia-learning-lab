import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { HomePage } from "@/components/home/HomePage";
import type { CurriculumModuleSummary } from "@/lib/curriculum";

/**
 * T-100 S-01 ランディング。受入基準: 両ロケールでhero(価値訴求)+CTA(カリキュラム/
 * サインアップ導線)+カリキュラム概観(3部)が描画される。
 * フィクスチャ読み込み・スナップショットパターンはCurriculumList.test.tsxを踏襲。
 */
const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/curriculum", import.meta.url));

function loadFixtureSummaries(locale: Locale): CurriculumModuleSummary[] {
  return loadAllModules(FIXTURES_ROOT, locale).map((mod) => ({
    meta: mod.meta,
    lessonCount: mod.lessons.length,
  }));
}

describe("HomePage", () => {
  it.each([["ja"], ["en"]] as const)(
    "renders hero, CTAs, and a 3-part curriculum overview (locale=%s)",
    (locale) => {
      const modules = loadFixtureSummaries(locale);
      const result = HomePage({ locale, modules });

      expect(result).toMatchSnapshot();
    },
  );

  it("primary CTA links to /learn and secondary CTA links to /auth/signup", () => {
    const result = HomePage({ locale: "ja", modules: [] });
    const json = JSON.stringify(result);
    expect(json).toContain('"href":"/learn"');
    expect(json).toContain('"href":"/auth/signup"');
  });

  it("renders 0-count part cards without throwing when no modules exist", () => {
    expect(() => HomePage({ locale: "en", modules: [] })).not.toThrow();
  });
});
