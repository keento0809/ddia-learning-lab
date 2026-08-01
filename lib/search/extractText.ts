/**
 * T-306 検索(S-09)向けのMDX本文プレーンテキスト抽出。
 * 参照設計: docs/design/02_詳細設計書.md §9(検索インデックス), §12-4(静的FlexSearch)。
 *
 * `lib/content.ts`のloadModuleが返すレッスン本文(`LessonEntry.body`、frontmatter除去済み
 * MDXソース)から、MDXカスタムコンポーネント(mdx-components.tsx登録の7種)とMarkdown記法を
 * 取り除き、検索インデックス対象のプレーンテキストを得る。フルAST解析(@mdx-js/loader等)は
 * next buildの描画パイプライン専用のためNode CLIスクリプトから直接呼べず、正規表現ベースの
 * 軽量実装とする。
 *
 * コンポーネント別の扱い:
 * - CodeBlock: コード本文は検索対象外として丸ごと除去(タグ+内容)
 * - Viz/BookRef/Figure/QuizInline: 自己終了タグとして丸ごと除去(地の文を持たない)
 * - Term/Callout: タグのみ除去し、子要素のテキストは残す(索引対象の地の文)
 */

const CODE_BLOCK_RE = /<CodeBlock\b[\s\S]*?<\/CodeBlock>/g;
const SELF_CLOSING_DROP_RE = /<(?:Viz|BookRef|Figure|QuizInline)\b[^>]*\/>/g;
const PAIRED_DROP_RE = /<(Viz|BookRef|Figure|QuizInline)\b[\s\S]*?<\/\1>/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const JSX_TAG_RE = /<\/?[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?>/g;
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const INLINE_CODE_RE = /`([^`]*)`/g;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?/gm;
const ORDERED_LIST_RE = /^\s*\d+\.\s+/gm;
const UNORDERED_LIST_RE = /^\s*[-*+]\s+/gm;
const EMPHASIS_RE = /(\*\*\*|\*\*|\*|___|__|_)/g;
const WHITESPACE_RE = /\s+/g;

/** MDXレッスン本文からプレーンテキストを抽出する(frontmatterは呼び出し側で除去済みの前提)。 */
export function extractPlainText(mdxBody: string): string {
  let text = mdxBody;
  text = text.replace(CODE_BLOCK_RE, " ");
  text = text.replace(SELF_CLOSING_DROP_RE, " ");
  text = text.replace(PAIRED_DROP_RE, " ");
  text = text.replace(HTML_COMMENT_RE, " ");
  text = text.replace(JSX_TAG_RE, " ");
  text = text.replace(IMAGE_RE, "$1");
  text = text.replace(LINK_RE, "$1");
  text = text.replace(INLINE_CODE_RE, "$1");
  text = text.replace(HEADING_RE, "");
  text = text.replace(BLOCKQUOTE_RE, "");
  text = text.replace(ORDERED_LIST_RE, "");
  text = text.replace(UNORDERED_LIST_RE, "");
  text = text.replace(EMPHASIS_RE, "");
  text = text.replace(WHITESPACE_RE, " ").trim();
  return text;
}

/** 検索結果一覧に表示する抜粋。空白区切りで`maxLength`以内に収め、切り詰めた場合は末尾に"…"を付す。 */
export function buildExcerpt(text: string, maxLength = 160): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${base.trim()}…`;
}
