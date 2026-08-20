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
 *
 * `style`属性は既定の許可属性に含まれ、`<style>`要素と異なりDOMPurifyの
 * CSS値サニタイズを通らないため`url()`が無害化されずに残る
 * (tests/security/csp-t704-repentest.test.ts参照)。ノートのMarkdown表示に
 * インラインstyleを要する正当な用途はないため、属性ごと禁止する。
 */
export function renderNoteMarkdown(bodyMd: string): string {
  const rawHtml = marked.parse(bodyMd, { async: false });
  return DOMPurify.sanitize(rawHtml, { FORBID_ATTR: ["style"] });
}
