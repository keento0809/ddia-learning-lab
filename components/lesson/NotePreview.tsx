"use client";

import { useMemo } from "react";
import { renderNoteMarkdown } from "@/lib/notes/renderNoteMarkdown";

/**
 * ノートのMarkdownプレビュー本体。DOMPurify(lib/notes/renderNoteMarkdown.ts)が
 * `window`必須のため、components/lesson/LessonNotes.tsxから
 * `next/dynamic({ssr:false})`経由でのみロードされる想定(componentsツリーの
 * 他の場所から直接importしないこと)。
 */
export default function NotePreview({ bodyMd }: { bodyMd: string }) {
  const html = useMemo(() => renderNoteMarkdown(bodyMd), [bodyMd]);

  return (
    // DOMPurify.sanitize済みのHTMLのみを描画する(lib/notes/renderNoteMarkdown.ts)
    <div
      data-testid="lesson-note-preview"
      className="lesson-article max-w-none text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
