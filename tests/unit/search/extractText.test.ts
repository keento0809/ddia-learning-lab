import { describe, expect, it } from "vitest";
import { buildExcerpt, extractPlainText } from "@/lib/search/extractText";

describe("extractPlainText", () => {
  it("Term/Calloutはタグを除去し子要素のテキストを残す", () => {
    const mdx = [
      "# 見出し",
      "",
      '本文中の<Term slug="fault-tolerance">フォールトトレランス</Term>という語。',
      "",
      "<Callout type=\"info\">",
      "冗長性を高めることで信頼性を改善できる。",
      "</Callout>",
    ].join("\n");

    const text = extractPlainText(mdx);
    expect(text).toContain("見出し");
    expect(text).toContain("フォールトトレランス");
    expect(text).toContain("冗長性を高めることで信頼性を改善できる。");
    expect(text).not.toContain("<Term");
    expect(text).not.toContain("</Term>");
    expect(text).not.toContain("<Callout");
  });

  it("Viz/BookRef/QuizInlineは自己終了タグごと除去する", () => {
    const mdx = [
      "本文。",
      "",
      '<Viz name="hash-ring" />',
      "",
      "<QuizInline",
      '  id="q1"',
      '  prompt="設問"',
      '  options={[{ id: "a", label: "選択肢" }]}',
      '  correctOptionId="a"',
      '  explanation="解説"',
      "/>",
      "",
      "<BookRef chapter={1} />",
    ].join("\n");

    const text = extractPlainText(mdx);
    expect(text).toBe("本文。");
  });

  it("CodeBlockはタグと中身を丸ごと除去する", () => {
    const mdx = [
      "説明文。",
      "",
      '<CodeBlock lang="js">',
      "{`function add(a, b) { return a < b ? a : b; }`}",
      "</CodeBlock>",
      "",
      "続きの説明。",
    ].join("\n");

    const text = extractPlainText(mdx);
    expect(text).toBe("説明文。 続きの説明。");
  });

  it("Markdown記法(見出し/リスト/リンク/強調/インラインコード)を平文化する", () => {
    const mdx = [
      "## 見出し2",
      "",
      "- 項目1",
      "- 項目2",
      "",
      "1. 手順1",
      "",
      "**強調**された`fsync()`と[リンク文字列](https://example.com)。",
    ].join("\n");

    const text = extractPlainText(mdx);
    expect(text).toBe("見出し2 項目1 項目2 手順1 強調されたfsync()とリンク文字列。");
  });
});

describe("buildExcerpt", () => {
  it("maxLength以内ならそのまま返す", () => {
    expect(buildExcerpt("短い文章", 160)).toBe("短い文章");
  });

  it("maxLengthを超える場合は単語境界で切り詰めて…を付す", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const excerpt = buildExcerpt(text, 20);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(21);
    expect(text.startsWith(excerpt.slice(0, -1))).toBe(true);
  });
});
