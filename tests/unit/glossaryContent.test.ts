import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContentValidationError } from "@/lib/content";
import { loadGlossary } from "@/lib/glossaryContent";

const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/glossary", import.meta.url));

describe("loadGlossary", () => {
  it("正常フィクスチャからja/en対訳エントリをロードする", () => {
    const entries = loadGlossary(path.join(FIXTURES_ROOT, "valid"));
    expect(entries).toEqual([
      {
        slug: "latency",
        term: { ja: "レイテンシ", en: "latency" },
        definition: {
          ja: "リクエストからレスポンスまでの所要時間(架空の説明、テスト用フィクスチャ)。",
          en: "The time elapsed between a request and its response (fictional description, test fixture only).",
        },
      },
      {
        slug: "throughput",
        term: { ja: "スループット", en: "throughput" },
        definition: {
          ja: "単位時間あたりに処理できる件数(架空の説明、テスト用フィクスチャ)。",
          en: "The number of operations processed per unit of time (fictional description, test fixture only).",
        },
      },
    ]);
  });

  it("content/glossary.yamlが存在しない場合は空配列を返す(T-110/T-111着手前の現状)", () => {
    expect(loadGlossary(path.join(FIXTURES_ROOT, "empty"))).toEqual([]);
  });

  it("ja/en対訳が欠けているエントリはファイルパス付きで例外を投げる", () => {
    expect(() => loadGlossary(path.join(FIXTURES_ROOT, "invalid"))).toThrowError(
      ContentValidationError,
    );

    try {
      loadGlossary(path.join(FIXTURES_ROOT, "invalid"));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ContentValidationError);
      const contentErr = err as ContentValidationError;
      expect(contentErr.filePath).toContain("glossary.yaml");
      expect(contentErr.message).toContain("term");
    }
  });
});
