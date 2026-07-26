"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { getGlossaryEntry } from "@/lib/glossary";

/**
 * MDXカスタムコンポーネント<Term>(T-103, 02§4.1)。用語集ポップオーバー(対訳表示)。
 * content/glossary.yaml(.claude/rules/i18n.md)に該当slugが未登録の場合
 * (T-110/T-111着手前の現時点を含む)は、ポップオーバーなしでchildrenのみ描画する
 * (T-101/T-102が確立した「content未投入時は空状態を描画する」判断を踏襲)。
 *
 * T-305 qa-evaluator検出の恒久対策: ①外側クリック・Escapeで閉じない、
 * ②同一ページの複数<Term>を同時に開いたまま重なり続ける、という2件の操作性欠陥
 * (T-105決定事項ログの「fixed insetモーダル的UIはフォーカストラップ・Escape
 * クローズを常時セットで検討」と同種の指摘)への対応。モジュールスコープの
 * close関数レジストリで、Zustand等の追加状態管理を持ち込まずに複数<Term>間の
 * 相互排他(新規オープン時に他を閉じる)を実現する。
 */
const openTermCloseHandlers = new Set<() => void>();

export function Term({ slug, children }: { slug: string; children: ReactNode }) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.term;
  const entry = getGlossaryEntry(slug);
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    for (const otherClose of openTermCloseHandlers) {
      otherClose();
    }
    openTermCloseHandlers.add(close);

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      openTermCloseHandlers.delete(close);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!entry) {
    return <span>{children}</span>;
  }

  const otherLocale = locale === "ja" ? "en" : "ja";

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={formatMessage(t.triggerAriaLabel, { term: entry.term[locale] })}
        onClick={() => setOpen((value) => !value)}
        className="underline decoration-dotted decoration-neutral-400 underline-offset-4 hover:decoration-neutral-700 dark:hover:decoration-neutral-300"
      >
        {children}
      </button>
      {open ? (
        <span
          id={popoverId}
          data-testid={`term-popover-${slug}`}
          className="absolute left-0 top-full z-10 mt-1 w-64 rounded border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <span className="block font-semibold">{entry.term[locale]}</span>
          <span className="mt-1 block text-neutral-600 dark:text-neutral-400">
            {entry.definition[locale]}
          </span>
          <span className="mt-2 block border-t border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-500">
            {entry.term[otherLocale]}
          </span>
        </span>
      ) : null}
    </span>
  );
}
