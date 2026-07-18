import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContentValidationError, listModuleSlugs, loadModule } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";

const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/content", import.meta.url));

describe("listModuleSlugs", () => {
  it("正常フィクスチャからモジュールslugを列挙する", () => {
    expect(listModuleSlugs(path.join(FIXTURES_ROOT, "valid"), "ja")).toEqual([
      "01-reliability",
    ]);
  });

  it("ロケールディレクトリが存在しない場合は空配列を返す", () => {
    expect(
      listModuleSlugs(path.join(FIXTURES_ROOT, "valid"), "fr" as unknown as Locale),
    ).toEqual([]);
  });
});

describe("loadModule", () => {
  it("正常フィクスチャをレッスン/quiz/演習付きでロードする", () => {
    const mod = loadModule(path.join(FIXTURES_ROOT, "valid"), "ja", "01-reliability");
    expect(mod.meta).toEqual({
      slug: "01-reliability",
      title: "信頼性の基礎",
      order: 1,
      minutes: 45,
    });
    expect(mod.lessons.map((l) => l.slug)).toEqual([
      "01-reliability/01-load-and-performance",
      "01-reliability/02-percentiles",
    ]);
    expect(mod.quizFilePath).not.toBeNull();
    expect(mod.exercises.map((e) => e.slug)).toEqual(["01-reliability/percentile-lab"]);
  });

  it("frontmatter必須項目が欠けているとファイルパス付きで例外を投げる", () => {
    expect(() =>
      loadModule(path.join(FIXTURES_ROOT, "missing-frontmatter"), "ja", "01-reliability"),
    ).toThrowError(ContentValidationError);

    try {
      loadModule(path.join(FIXTURES_ROOT, "missing-frontmatter"), "ja", "01-reliability");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ContentValidationError);
      const contentErr = err as ContentValidationError;
      expect(contentErr.filePath).toContain("01-load-and-performance.mdx");
      expect(contentErr.message).toContain("minutes");
    }
  });
});
