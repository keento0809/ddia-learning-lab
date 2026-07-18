import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../scripts/validate-content";

const FIXTURES_ROOT = fileURLToPath(new URL("../fixtures/content", import.meta.url));
const root = (name: string) => path.join(FIXTURES_ROOT, name);

describe("validateContent", () => {
  it("正常フィクスチャは検証を通過しslugマニフェストを生成する", () => {
    const result = validateContent(root("valid"));

    expect(result.issues).toEqual([]);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest?.entries).toEqual(
      expect.arrayContaining([
        { itemType: "lesson", slug: "01-reliability/01-load-and-performance", module: "01-reliability" },
        { itemType: "lesson", slug: "01-reliability/02-percentiles", module: "01-reliability" },
        { itemType: "quiz", slug: "01-reliability/quiz", module: "01-reliability" },
        { itemType: "exercise", slug: "01-reliability/percentile-lab", module: "01-reliability" },
      ]),
    );
    expect(result.manifest?.entries).toHaveLength(4);
  });

  it("slug欠落フィクスチャは特定可能なエラー(ファイルパス+原因)を出して失敗する", () => {
    const result = validateContent(root("missing-slug"));

    expect(result.manifest).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: expect.stringContaining("en/01-reliability/02-percentiles.mdx"),
          message: expect.stringContaining("レッスンslugが欠落"),
        }),
      ]),
    );
  });

  it("演習testsハッシュ不一致フィクスチャは両ファイルパスを含むエラーを出して失敗する", () => {
    const result = validateContent(root("tests-mismatch"));

    expect(result.manifest).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: expect.stringContaining("en/01-reliability/labs/percentile-lab.yaml"),
          message: expect.stringMatching(/ハッシュが一致しません.*ja\/01-reliability\/labs\/percentile-lab\.yaml/),
        }),
      ]),
    );
  });

  it("リンク切れフィクスチャは参照先を含むエラーを出して失敗する", () => {
    const result = validateContent(root("broken-link"));

    expect(result.manifest).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: expect.stringContaining("ja/01-reliability/01-load-and-performance.mdx"),
          message: expect.stringContaining("00-nonexistent-lesson"),
        }),
      ]),
    );
  });

  it("frontmatter必須項目欠落フィクスチャはファイルパス+原因を出して失敗する", () => {
    const result = validateContent(root("missing-frontmatter"));

    expect(result.manifest).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: expect.stringContaining("ja/01-reliability/01-load-and-performance.mdx"),
          message: expect.stringContaining("minutes"),
        }),
      ]),
    );
  });

  it("存在しないルートに対しては空集合として成功しslugなしマニフェストを生成する", () => {
    const result = validateContent(root("does-not-exist"));

    expect(result.issues).toEqual([]);
    expect(result.manifest?.entries).toEqual([]);
  });
});
