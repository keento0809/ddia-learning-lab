// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderNoteMarkdown } from "@/lib/notes/renderNoteMarkdown";

/**
 * T-307受入基準「DOMPurifyによるサニタイズのXSSテスト(script注入が無害化)」。
 * markedはMarkdown中の生HTML埋め込みをデフォルトで許容するため、悪意ある
 * script/イベントハンドラ属性がDOMPurifyで無害化されることを直接検証する。
 */
describe("renderNoteMarkdown", () => {
  it("strips <script> tags injected via raw HTML in the note body", () => {
    const html = renderNoteMarkdown('<script>alert("xss")</script>本文');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).toContain("本文");
  });

  it("strips inline event handler attributes (onerror) from injected HTML", () => {
    const html = renderNoteMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("strips javascript: URLs from links", () => {
    const html = renderNoteMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("renders ordinary Markdown formatting as HTML", () => {
    const html = renderNoteMarkdown("# 見出し\n\n- 項目1\n- 項目2\n\n**強調**");
    expect(html).toContain("<h1>見出し</h1>");
    expect(html).toContain("<li>項目1</li>");
    expect(html).toContain("<strong>強調</strong>");
  });

  /**
   * tests/security/csp-t704-repentest.test.ts参照。style属性はDOMPurify既定の
   * 許可属性で、<style>要素と異なりCSS値のサニタイズを通らないためurl()が
   * そのまま残る(=残存XSS/ビーコン経路)。style属性ごと禁止して無害化する。
   */
  it("strips the style attribute (including url()) from injected HTML", () => {
    const html = renderNoteMarkdown('<p style="background:url(http://127.0.0.1:8899/exfil)">本文</p>');
    expect(html).not.toContain("style=");
    expect(html).not.toContain("url(");
    expect(html).not.toContain("127.0.0.1:8899");
    expect(html).toContain("本文");
  });

  it("strips the style attribute using an alternate quoting/url() form", () => {
    const html = renderNoteMarkdown("<div style=\"background-image:url('http://127.0.0.1:8899/exfil2')\">本文</div>");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("127.0.0.1:8899");
    expect(html).toContain("本文");
  });

  it("still removes <style> elements entirely (content is dropped, not just the tag)", () => {
    const html = renderNoteMarkdown("<style>body{background:url(http://127.0.0.1:8899/exfil3)}</style>本文");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("127.0.0.1:8899");
    expect(html).toContain("本文");
  });
});
