"use client";

import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";

/**
 * MDXカスタムコンポーネント<BookRef>(T-103, 02§4.1)。原著該当章の書誌参照カード。
 * 書誌情報(タイトル/著者/章番号)のみを表示し、本文の引用・翻訳は含めない
 * (CLAUDE.md規則6)。
 */
export function BookRef({ chapter }: { chapter: number }) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.bookRef;

  return (
    <aside className="my-4 rounded border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="font-semibold">{t.title}</p>
      <p className="text-neutral-600 dark:text-neutral-400">{t.author}</p>
      <p className="mt-1">{formatMessage(t.label, { chapter })}</p>
    </aside>
  );
}
