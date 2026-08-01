import { describe, expect, it } from "vitest";
import { getLessonPreviewHtml, resolveLessonAccessTier } from "@/lib/lessonAccess";

/**
 * T-602(ADR-009 §3.1)。labPage.test.tsと同じ方式(tests/unit/labPage.test.ts参照)で、
 * フィクスチャではなく実コンテンツ(lib/generated/module-detail.*.json、
 * npm run generate:curriculumのビルド生成物)に対して検証する
 * (moduleSlug/lessonSlugからのtier解決という実データ依存のロジックのため)。
 */
describe("resolveLessonAccessTier", () => {
  it("モジュール1(Free Tier)の全レッスンはfreeTier", () => {
    expect(resolveLessonAccessTier("ja", "01-reliability", "01-reliability-and-faults")).toBe(
      "freeTier",
    );
    expect(resolveLessonAccessTier("ja", "01-reliability", "04-maintainability")).toBe(
      "freeTier",
    );
  });

  it("モジュール2〜12の第1レッスンはpreview", () => {
    expect(resolveLessonAccessTier("ja", "02-data-models", "01-relational-vs-document")).toBe(
      "preview",
    );
    expect(resolveLessonAccessTier("ja", "12-capstone-design", "01-unbundling")).toBe("preview");
  });

  it("モジュール2〜12の第1レッスン以外はgated", () => {
    expect(
      resolveLessonAccessTier("ja", "02-data-models", "02-document-schema-flexibility"),
    ).toBe("gated");
  });

  it("英語ロケールでも同様に解決できる", () => {
    expect(resolveLessonAccessTier("en", "01-reliability", "01-reliability-and-faults")).toBe(
      "freeTier",
    );
    expect(resolveLessonAccessTier("en", "02-data-models", "01-relational-vs-document")).toBe(
      "preview",
    );
  });

  it("存在しないモジュール/レッスンslugはundefined", () => {
    expect(resolveLessonAccessTier("ja", "does-not-exist", "01-foo")).toBeUndefined();
    expect(resolveLessonAccessTier("ja", "02-data-models", "does-not-exist")).toBeUndefined();
  });
});

describe("getLessonPreviewHtml", () => {
  it("preview階層のレッスンにはHTMLが生成されている", () => {
    const html = getLessonPreviewHtml("ja", "02-data-models", "01-relational-vs-document");
    expect(html).toBeDefined();
    expect(html).toContain("<h2>");
    expect(html).not.toContain("<Term");
    expect(html).not.toContain("<Callout");
  });

  it("freeTier/gated階層のレッスンにはプレビューが生成されていない", () => {
    expect(
      getLessonPreviewHtml("ja", "01-reliability", "01-reliability-and-faults"),
    ).toBeUndefined();
    expect(
      getLessonPreviewHtml("ja", "02-data-models", "02-document-schema-flexibility"),
    ).toBeUndefined();
  });
});
