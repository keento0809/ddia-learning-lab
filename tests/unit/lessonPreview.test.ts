import { describe, expect, it } from "vitest";
import {
  buildLessonPreviewMarkdown,
  extractLessonPreviewMarkdown,
  stripMdxComponents,
} from "@/lib/lessonPreview";

describe("stripMdxComponents", () => {
  it("<Term>を中身のテキストのみへ変換する", () => {
    const input = '<Term slug="relational-model">リレーショナルモデル</Term>を使う。';
    expect(stripMdxComponents(input)).toBe("リレーショナルモデルを使う。");
  });

  it("<Callout>をblockquoteへ変換する", () => {
    const input = ['<Callout type="info">', "1行目の注意書き。", "2行目。", "</Callout>"].join("\n");
    expect(stripMdxComponents(input)).toBe("> 1行目の注意書き。\n> 2行目。");
  });

  it("<QuizInline>を除去する", () => {
    expect(stripMdxComponents("本文\n\n<QuizInline questionId=\"q1\" />\n\n続き")).toBe(
      "本文\n\n\n\n続き",
    );
  });
});

describe("extractLessonPreviewMarkdown", () => {
  it("H2見出しが3つ以上ある場合は3つ目の直前までを切り出す(先頭H1は除去)", () => {
    const body = [
      "# レッスンタイトル",
      "",
      "導入段落。",
      "",
      "## 見出し1",
      "",
      "セクション1の本文。",
      "",
      "## 見出し2",
      "",
      "セクション2の本文。",
      "",
      "## 見出し3",
      "",
      "ここは含まれてはいけない。",
      "",
    ].join("\n");

    const preview = extractLessonPreviewMarkdown(body);

    expect(preview).toContain("導入段落。");
    expect(preview).toContain("## 見出し1");
    expect(preview).toContain("セクション1の本文。");
    expect(preview).toContain("## 見出し2");
    expect(preview).toContain("セクション2の本文。");
    expect(preview).not.toContain("見出し3");
    expect(preview).not.toContain("ここは含まれてはいけない");
    expect(preview).not.toContain("レッスンタイトル");
  });

  it("H2見出しが2つ以下の場合は約30%にフォールバックする", () => {
    const paragraph = "あ".repeat(100);
    const body = `# タイトル\n\n## 見出し1\n\n${paragraph}\n\n## 見出し2\n\n${paragraph}\n`;

    const preview = extractLessonPreviewMarkdown(body);
    const withoutTitle = body.replace(/^\s*#[ \t][^\n]*\r?\n+/, "").trim();

    expect(preview.length).toBeCloseTo(Math.ceil(withoutTitle.length * 0.3), -1);
    expect(withoutTitle.startsWith(preview)).toBe(true);
  });

  it("frontmatter除去直後の空行を挟んでもH1見出しを除去する(実データの形と一致)", () => {
    const body = "\n# レッスンタイトル\n\n導入段落。\n\n## 見出し1\n\n本文1。\n\n## 見出し2\n\n本文2。\n\n## 見出し3\n\n含まれない。\n";

    const preview = extractLessonPreviewMarkdown(body);

    expect(preview).not.toContain("レッスンタイトル");
    expect(preview).toContain("導入段落。");
    expect(preview).toContain("本文1。");
    expect(preview).toContain("本文2。");
    expect(preview).not.toContain("含まれない");
  });
});

describe("buildLessonPreviewMarkdown", () => {
  it("JSXコンポーネントを平文化してから見出し境界で切り出す", () => {
    const body = [
      "# タイトル",
      "",
      "導入段落。",
      "",
      "## 見出し1",
      "",
      '<Term slug="x">用語</Term>の説明。',
      "",
      "## 見出し2",
      "",
      '<Callout type="info">',
      "補足。",
      "</Callout>",
      "",
      "## 見出し3",
      "",
      "含まれてはいけない本文。",
      "",
    ].join("\n");

    const preview = buildLessonPreviewMarkdown(body);

    expect(preview).toContain("用語の説明。");
    expect(preview).toContain("> 補足。");
    expect(preview).not.toContain("<Term");
    expect(preview).not.toContain("<Callout");
    expect(preview).not.toContain("含まれてはいけない本文");
  });
});
