// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotePreview from "@/components/lesson/NotePreview";

describe("NotePreview", () => {
  it("renders sanitized markdown as HTML", () => {
    const html = renderToStaticMarkup(<NotePreview bodyMd="**強調** テキスト" />);
    expect(html).toContain('data-testid="lesson-note-preview"');
    expect(html).toContain("<strong>強調</strong>");
  });

  it("neutralizes a <script> tag injected into the note body", () => {
    const html = renderToStaticMarkup(<NotePreview bodyMd='<script>alert("xss")</script>' />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
  });
});
