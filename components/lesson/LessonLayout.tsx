"use client";

import { useRef, type ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { useLessonLayoutStore } from "@/lib/store/lessonLayoutStore";
import { useScrollThreshold } from "@/lib/lesson/useScrollThreshold";
import { useDrawerFocusTrap } from "@/lib/lesson/useDrawerFocusTrap";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import type { ModuleTocItem } from "@/lib/moduleDetail";
import { LessonToc } from "./LessonToc";
import { PageToc } from "./PageToc";

/**
 * S-04 レッスン画面(T-103, 02§4.1)。3カラムレイアウト(左=モジュール内目次、
 * 中央=本文、右=ページ内目次)。モバイル(<768px、Tailwindの`md`ブレークポイント)
 * では左右ペインをドロワー化する(02§4.1「モバイル(<768px): 左右ペインは
 * ドロワー化」)。
 *
 * スクロール80%検知(useScrollThreshold)はコールバックのみ実装し、実際の
 * in_progress記録(進捗API接続)はOut of Scope(T-105)のため何もしない。
 *
 * 失敗→恒久対策: 当初MDXの本文コンポーネント自体を`Content: ComponentType`
 * propとして受け取り内部で`<Content />`のように呼び出す設計にしていたが、
 * 関数(コンポーネント参照)はServer Component(page.tsx)からClient Component
 * へpropとして直接渡せない(React RSCの制約、実機で
 * "Functions cannot be passed directly to Client Components" エラーを確認)。
 * 呼び出し側(page.tsx)で`<Content />`を先に描画し、その結果(ReactNode)を
 * `children`として渡す設計に変更して解消した。
 *
 * 失敗→恒久対策: qa-evaluatorの実ブラウザ検証(モバイル幅+キーボード操作)で、
 * ドロワー表示中にTabで背後のコンテンツへフォーカスが漏れる・Escapeで閉じ
 * られないという操作性の欠陥を検出した。`useDrawerFocusTrap`で両ドロワーに
 * フォーカストラップ+Escapeクローズ+`role="dialog"`/`aria-modal`を付与して
 * 解消した(詳細はlib/lesson/useDrawerFocusTrap.ts参照)。
 */
export function LessonLayout({
  locale,
  moduleSlug,
  moduleTitle,
  lessonTitle,
  minutes,
  toc,
  currentKey,
  prevHref,
  nextHref,
  children,
}: {
  locale: Locale;
  moduleSlug: string;
  moduleTitle: string;
  lessonTitle: string;
  minutes: number;
  toc: ModuleTocItem[];
  currentKey: string;
  prevHref: string | null;
  nextHref: string | null;
  children: ReactNode;
}) {
  const t = getMessages(locale).lesson;
  const articleRef = useRef<HTMLElement | null>(null);
  const openDrawer = useLessonLayoutStore((state) => state.openDrawer);
  const openDrawerPanel = useLessonLayoutStore((state) => state.openDrawerPanel);
  const closeDrawer = useLessonLayoutStore((state) => state.closeDrawer);

  useScrollThreshold(articleRef, () => {
    // 進捗API接続(in_progress記録)はT-105のスコープ(Out of Scope)。検知のみ。
  });

  const leftDrawerRef = useDrawerFocusTrap(openDrawer === "moduleToc", closeDrawer);
  const rightDrawerRef = useDrawerFocusTrap(openDrawer === "pageToc", closeDrawer);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start">
      <div className="flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => openDrawerPanel("moduleToc")}
          data-testid="open-module-toc-drawer"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          {t.openModuleTocLabel}
        </button>
        <button
          type="button"
          onClick={() => openDrawerPanel("pageToc")}
          data-testid="open-page-toc-drawer"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          {t.openPageTocLabel}
        </button>
      </div>

      <aside
        ref={leftDrawerRef}
        data-testid="lesson-left-pane"
        role={openDrawer === "moduleToc" ? "dialog" : undefined}
        aria-modal={openDrawer === "moduleToc" ? true : undefined}
        aria-label={openDrawer === "moduleToc" ? t.moduleTocHeading : undefined}
        className={
          openDrawer === "moduleToc"
            ? "fixed inset-0 z-20 overflow-y-auto bg-white p-4 dark:bg-neutral-950 md:static md:z-auto md:block md:w-[260px] md:shrink-0 md:bg-transparent md:p-0"
            : "hidden md:block md:w-[260px] md:shrink-0"
        }
      >
        {openDrawer === "moduleToc" ? (
          <button
            type="button"
            onClick={closeDrawer}
            data-testid="close-module-toc-drawer"
            className="mb-4 rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 md:hidden"
          >
            {t.closeLabel}
          </button>
        ) : null}
        <LessonToc locale={locale} moduleSlug={moduleSlug} toc={toc} currentKey={currentKey} />
      </aside>

      <main className="mx-auto w-full max-w-[72ch] flex-1">
        <nav aria-label="breadcrumb" className="mb-2 text-sm text-neutral-500 dark:text-neutral-500">
          <Link href={`/learn/${moduleSlug}`} prefetch={false}>
            {moduleTitle}
          </Link>
        </nav>
        <h1 className="mb-2 text-2xl font-semibold">{lessonTitle}</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          {formatMessage(t.minutesLabel, { minutes })}
        </p>
        <LessonLocaleProvider locale={locale}>
          <article
            ref={articleRef}
            data-testid="lesson-article"
            className="lesson-article max-w-none"
          >
            {children}
          </article>
        </LessonLocaleProvider>
        <div className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
          {prevHref ? (
            <Link
              href={prevHref}
              prefetch={false}
              data-testid="lesson-prev-link"
              className="text-sm hover:underline"
            >
              {t.prevLabel}
            </Link>
          ) : (
            <span />
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              prefetch={false}
              data-testid="lesson-next-link"
              className="text-sm hover:underline"
            >
              {t.nextLabel}
            </Link>
          ) : (
            <span />
          )}
        </div>
      </main>

      <aside
        ref={rightDrawerRef}
        data-testid="lesson-right-pane"
        role={openDrawer === "pageToc" ? "dialog" : undefined}
        aria-modal={openDrawer === "pageToc" ? true : undefined}
        aria-label={openDrawer === "pageToc" ? t.pageTocHeading : undefined}
        className={
          openDrawer === "pageToc"
            ? "fixed inset-0 z-20 overflow-y-auto bg-white p-4 dark:bg-neutral-950 md:static md:z-auto md:block md:w-[280px] md:shrink-0 md:bg-transparent md:p-0"
            : "hidden md:block md:w-[280px] md:shrink-0"
        }
      >
        {openDrawer === "pageToc" ? (
          <button
            type="button"
            onClick={closeDrawer}
            data-testid="close-page-toc-drawer"
            className="mb-4 rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 md:hidden"
          >
            {t.closeLabel}
          </button>
        ) : null}
        <PageToc articleRef={articleRef} locale={locale} />
      </aside>
    </div>
  );
}
