import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { HomePage } from "@/components/home/HomePage";
import type { CurriculumModuleSummary } from "@/lib/curriculum";

/**
 * T-100 S-01 ランディング。受入基準: 両ロケールでhero(価値訴求)+CTA(カリキュラム/
 * サインアップ導線)+カリキュラム概観(3部)が描画される。
 * フィクスチャ読み込み・スナップショットパターンはCurriculumList.test.tsxを踏襲。
 *
 * ヒーローCTAのログイン状態分岐(landing-cta-logged-in)追加に伴い、HomePageは
 * `@/lib/auth/config`のauth()を直接呼ぶ非同期コンポーネントになった。
 * signupPageRedirect.test.tsxと同じく`vi.mock`でauth()をモックする。
 */
const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/curriculum", import.meta.url));

const authMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

function loadFixtureSummaries(locale: Locale): CurriculumModuleSummary[] {
  return loadAllModules(FIXTURES_ROOT, locale).map((mod) => ({
    meta: mod.meta,
    lessonCount: mod.lessons.length,
  }));
}

describe("HomePage", () => {
  afterEach(() => {
    authMock.mockReset();
  });

  it.each([["ja"], ["en"]] as const)(
    "renders hero, CTAs, and a 3-part curriculum overview when logged out (locale=%s)",
    async (locale) => {
      authMock.mockResolvedValue(null);
      const modules = loadFixtureSummaries(locale);
      const result = await HomePage({ locale, modules });

      expect(result).toMatchSnapshot();
    },
  );

  it.each([["ja"], ["en"]] as const)(
    "renders the continue CTA in place of the sign-up CTA when logged in (locale=%s)",
    async (locale) => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      const modules = loadFixtureSummaries(locale);
      const result = await HomePage({ locale, modules });

      expect(result).toMatchSnapshot();
    },
  );

  it("logged out: primary CTA links to /learn and secondary CTA links to /auth/signup", async () => {
    authMock.mockResolvedValue(null);
    const result = await HomePage({ locale: "ja", modules: [] });
    const json = JSON.stringify(result);
    expect(json).toContain('"href":"/learn"');
    expect(json).toContain('"href":"/auth/signup"');
    expect(json).not.toContain('"href":"/dashboard"');
    expect(json).toContain("無料で始める");
  });

  it("logged in: secondary CTA links to /dashboard and primary CTA still links to /learn", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const result = await HomePage({ locale: "ja", modules: [] });
    const json = JSON.stringify(result);
    expect(json).toContain('"href":"/learn"');
    expect(json).toContain('"href":"/dashboard"');
    expect(json).not.toContain('"href":"/auth/signup"');
    expect(json).toContain("続きから学ぶ");
  });

  it("renders 0-count part cards without throwing when no modules exist", async () => {
    authMock.mockResolvedValue(null);
    const result = await HomePage({ locale: "en", modules: [] });
    expect(result).toBeDefined();
  });
});
