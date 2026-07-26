"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { createDebouncedSaver, type DebouncedSaver } from "@/lib/lab/debouncedSaver";
import { useNoteQuery } from "@/lib/notes/useNoteQuery";
import { useSaveNoteMutation } from "@/lib/notes/useSaveNoteMutation";

/** 02§4.1「自動保存(2s debounce)」。 */
const NOTE_AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * プレビュー(marked+DOMPurify)は`window`必須のため`next/dynamic({ssr:false})`
 * でクライアント専用ロードにする(components/lab/CodeEditor.tsx・
 * components/mdx/Viz.tsxと同じ既存パターン)。
 */
const NotePreview = dynamic(() => import("./NotePreview"), { ssr: false });

/**
 * S-04 右ペイン「ノート(折畳)」(T-307、02§4.1/§2.1 notesテーブル)。
 * Markdown入力を2s debounceでPUT /api/notes/{lessonSlug}へ自動保存し、
 * プレビュータブでDOMPurify(lib/notes/renderNoteMarkdown.ts)によるサニタイズ
 * 済みHTMLを表示する。ノートは認証必須(02§3表#5-6)のため、未ログイン時は
 * サインインへの導線のみを示す(ゲスト用ローカル保存は設計上要求されていない)。
 */
export function LessonNotes({
  locale,
  lessonSlug,
  isAuthenticated,
}: {
  locale: Locale;
  lessonSlug: string;
  isAuthenticated: boolean;
}) {
  const t = getMessages(locale).lesson;
  const noteQuery = useNoteQuery(lessonSlug, { enabled: isAuthenticated });
  const saveMutation = useSaveNoteMutation(lessonSlug);

  const [draft, setDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (hydrated) return;
    if (noteQuery.isSuccess) {
      setDraft(noteQuery.data.note?.bodyMd ?? "");
      setHydrated(true);
    } else if (noteQuery.isError) {
      setHydrated(true);
    }
  }, [hydrated, noteQuery.isSuccess, noteQuery.isError, noteQuery.data]);

  // レッスン間ナビゲーション(Next.jsのクライアントサイド遷移)はLessonNotesを
  // アンマウントする。debounce待機中(2s未満)に離脱すると`saver.cancel()`だけでは
  // 保留中の編集が警告なく失われるため、`pendingRef`/`draftRef`で保留状態と
  // 最新値を追跡し、アンマウント時に保留があれば即座に保存する(qa-evaluator
  // T-307検証で検出、失敗→恒久対策)。
  const pendingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mutateRef = useRef(saveMutation.mutate);
  mutateRef.current = saveMutation.mutate;

  const saverRef = useRef<DebouncedSaver<string> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver<string>((value) => {
      pendingRef.current = false;
      mutateRef.current(value);
    }, NOTE_AUTOSAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    const saver = saverRef.current;
    return () => {
      saver?.cancel();
      if (pendingRef.current) {
        pendingRef.current = false;
        mutateRef.current(draftRef.current);
      }
    };
  }, []);

  function handleChange(value: string) {
    setDraft(value);
    pendingRef.current = true;
    saverRef.current?.trigger(value);
  }

  if (!isAuthenticated) {
    return (
      <section data-testid="lesson-notes" aria-label={t.notesHeading}>
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
            {t.notesHeading}
          </summary>
          <p
            data-testid="lesson-notes-signin-prompt"
            className="mt-2 text-sm text-neutral-600 dark:text-neutral-400"
          >
            {t.notesSignInPrompt}
            {" "}
            <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
              {t.notesSignInLinkLabel}
            </Link>
          </p>
        </details>
      </section>
    );
  }

  return (
    <section data-testid="lesson-notes" aria-label={t.notesHeading}>
      <details open>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
          {t.notesHeading}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div role="tablist" className="flex gap-1 text-xs">
            <button
              type="button"
              role="tab"
              aria-selected={view === "edit"}
              data-testid="lesson-notes-edit-tab"
              onClick={() => setView("edit")}
              className={
                view === "edit"
                  ? "rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded border border-neutral-300 px-2 py-1 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
              }
            >
              {t.notesEditTabLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "preview"}
              data-testid="lesson-notes-preview-tab"
              onClick={() => setView("preview")}
              className={
                view === "preview"
                  ? "rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded border border-neutral-300 px-2 py-1 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
              }
            >
              {t.notesPreviewTabLabel}
            </button>
          </div>

          {view === "edit" ? (
            <textarea
              value={draft}
              disabled={!hydrated}
              onChange={(event) => handleChange(event.target.value)}
              placeholder={t.notesPlaceholder}
              data-testid="lesson-notes-textarea"
              rows={10}
              className="w-full resize-y rounded border border-neutral-300 bg-transparent p-2 text-sm disabled:opacity-60 dark:border-neutral-700"
            />
          ) : (
            <NotePreview bodyMd={draft} />
          )}

          <p
            role={saveMutation.isError ? "alert" : undefined}
            data-testid="lesson-notes-status"
            className={
              saveMutation.isError
                ? "text-xs text-red-600 dark:text-red-400"
                : "text-xs text-neutral-500 dark:text-neutral-500"
            }
          >
            {saveMutation.isError
              ? t.notesErrorLabel
              : saveMutation.isPending
                ? t.notesSavingLabel
                : saveMutation.isSuccess
                  ? t.notesSavedLabel
                  : ""}
          </p>
        </div>
      </details>
    </section>
  );
}
