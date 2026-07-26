import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

/**
 * ノートのMarkdownプレビュー用HTML生成(T-307受入基準「DOMPurifyによる
 * サニタイズのXSSテスト(script注入が無害化)」)。Markdownは仕様上生HTMLの
 * 埋め込みを許容するため(markedの既定挙動)、`<script>`や`onerror`属性等の
 * 注入をDOMPurifyで無害化してからdangerouslySetInnerHTMLへ渡す。
 *
 * DOMPurifyは`window`/`document`に依存するためブラウザ専用(呼び出し側は
 * `next/dynamic({ssr:false})`でクライアントのみロードすること、
 * components/lesson/LessonNotes.tsx参照)。
 */
export function renderNoteMarkdown(bodyMd: string): string {
  const rawHtml = marked.parse(bodyMd, { async: false });
  return DOMPurify.sanitize(rawHtml);
}
