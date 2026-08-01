const H1_HEADING_LINE_RE = /^\s*#[ \t][^\n]*\r?\n+/;
const H2_HEADING_RE = /^##[ \t].+$/gm;
const PREVIEW_FALLBACK_RATIO = 0.3;

/**
 * T-602: Preview階層(ADR-009 §3.1)の冒頭プレビュー生成。
 * レッスンMDXの生body(lib/content.tsのLessonEntry.body、frontmatter除去済み)を
 * 対象に、Server ComponentでMDXコンパイル済みツリーを丸ごと未認証者に返さずに
 * 済むよう、ビルド時(scripts/generate-curriculum.ts)に事前抽出したプレーンな
 * Markdown文字列を作る。
 *
 * `<Term>` `<Callout>` はコンテンツ本文の1〜2番目の見出しセクション内に頻出する
 * MDX専用JSXコンポーネント(content/ja/02-data-models/01-*.mdx等で確認)。
 * これらはMDXコンパイラ(@next/mdx)経由でしか解決できないため、プレビュー生成では
 * プレーンMarkdownへ変換する(<Term>は中身のテキストのみ残す、<Callout>は
 * blockquoteへ変換する)。
 */
export function stripMdxComponents(markdown: string): string {
  return markdown
    .replace(/<Term[^>]*>([\s\S]*?)<\/Term>/g, "$1")
    .replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/g, (_match, inner: string) =>
      inner
        .trim()
        .split("\n")
        .map((line) => (line.trim().length > 0 ? `> ${line.trim()}` : ">"))
        .join("\n"),
    )
    .replace(/<QuizInline[^>]*\/>/g, "")
    .replace(/<QuizInline[^>]*>[\s\S]*?<\/QuizInline>/g, "");
}

/**
 * ADR-009 §3.1「各モジュール第1レッスンの冒頭のみ(見出し2つ分または約30%)」。
 * H2見出しが3つ以上ある場合は3つ目の直前までを切り出す。2つ以下しかなく
 * 「3つ目の直前」という境界が定義できない場合は、本文全体の約30%にフォールバックする。
 * 先頭のH1見出し行はLessonLayoutが別途`<h1>{lessonTitle}</h1>`を描画するため除去する
 * (components/lesson/LessonLayout.tsx参照)。
 */
export function extractLessonPreviewMarkdown(body: string): string {
  const withoutTitle = body.replace(H1_HEADING_LINE_RE, "");
  const trimmed = withoutTitle.trim();
  const headingMatches = [...trimmed.matchAll(H2_HEADING_RE)];
  if (headingMatches.length >= 3) {
    const cutIndex = headingMatches[2].index ?? trimmed.length;
    return trimmed.slice(0, cutIndex).trim();
  }
  const fallbackLength = Math.max(1, Math.ceil(trimmed.length * PREVIEW_FALLBACK_RATIO));
  return trimmed.slice(0, fallbackLength).trim();
}

/** stripMdxComponents→extractLessonPreviewMarkdownを合成した、生成スクリプトの本体処理 */
export function buildLessonPreviewMarkdown(rawBody: string): string {
  return extractLessonPreviewMarkdown(stripMdxComponents(rawBody));
}
