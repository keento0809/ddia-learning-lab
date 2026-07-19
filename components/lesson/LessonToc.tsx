"use client";

import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { tocItemHref, tocItemKey, type ModuleTocItem } from "@/lib/moduleDetail";
import { useLessonLayoutStore } from "@/lib/store/lessonLayoutStore";

/**
 * S-04 左カラム「モジュール内目次」(T-103, 02§4.1)。T-102のModuleDetail一覧を
 * サイドバー用に再構成し、現在表示中のレッスンをaria-current="page"で示す。
 *
 * 失敗→恒久対策: qa-evaluatorの実ブラウザ検証で、モバイルドロワー表示中に
 * 目次のリンクをクリックして遷移しても、遷移先ページでドロワーが開いたまま
 * 残る(本文が読めない)ことが検出された。リンククリック時に必ず
 * closeDrawer()を呼ぶ(デスクトップ表示時は元々openDrawerがnullのため無害)。
 */
export function LessonToc({
  locale,
  moduleSlug,
  toc,
  currentKey,
}: {
  locale: Locale;
  moduleSlug: string;
  toc: ModuleTocItem[];
  currentKey: string;
}) {
  const t = getMessages(locale).lesson;
  const moduleDetailT = getMessages(locale).moduleDetail;
  const closeDrawer = useLessonLayoutStore((state) => state.closeDrawer);

  return (
    <nav aria-label={t.moduleTocHeading} data-testid="lesson-module-toc">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
        {t.moduleTocHeading}
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {toc.map((item) => {
          const key = tocItemKey(item);
          const isCurrent = key === currentKey;
          const label =
            item.kind === "lesson"
              ? item.title
              : item.kind === "quiz"
                ? moduleDetailT.quizItemLabel
                : formatMessage(moduleDetailT.exerciseItemLabel, { index: item.index });

          return (
            <li key={key}>
              <Link
                href={tocItemHref(moduleSlug, item)}
                prefetch={false}
                onClick={closeDrawer}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "block rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "block rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
