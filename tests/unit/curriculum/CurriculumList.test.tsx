import { fileURLToPath } from "node:url";
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
});
