"use client";

import { useEffect, useState, type RefObject } from "react";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { useLessonLayoutStore } from "@/lib/store/lessonLayoutStore";

interface HeadingItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugifyHeading(text: string, usedIds: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-") || "section";
  let candidate = base;
  let counter = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * S-04 右カラム「ページ内目次」(T-103, 02§4.1: h2/h3追随)。
 * remark/rehype系の見出しid付与プラグイン(rehype-slug等)を新規導入せず
 * (CLAUDE.md規則1、無許可の依存追加禁止)、クライアント側でarticle内のh2/h3を
 * 走査してid未設定の見出しにidを付与し、目次リストを構築する。
 * IntersectionObserverで現在表示中の見出しを追随ハイライトする。
 * 失敗→恒久対策: qa-evaluatorの実ブラウザ検証で検出された「モバイルドロワー内の
 * リンクをクリックしても遷移後にドロワーが開いたまま残る」不具合の修正として、
 * リンククリック時にcloseDrawer()を呼ぶ(LessonToc.tsxと同じ対策)。
 */
export function PageToc({
  articleRef,
  locale,
}: {
  articleRef: RefObject<HTMLElement | null>;
  locale: Locale;
}) {
  const t = getMessages(locale).lesson;
  const closeDrawer = useLessonLayoutStore((state) => state.closeDrawer);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const elements = Array.from(article.querySelectorAll<HTMLHeadingElement>("h2, h3"));
    const usedIds = new Set<string>();
    const items: HeadingItem[] = elements.map((el) => {
      if (!el.id) {
        el.id = slugifyHeading(el.textContent ?? "", usedIds);
      } else {
        usedIds.add(el.id);
      }
      return {
        id: el.id,
        text: el.textContent ?? "",
        level: el.tagName === "H2" ? 2 : 3,
      };
    });
    setHeadings(items);

    if (elements.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [articleRef]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label={t.pageTocHeading} data-testid="lesson-page-toc">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
        {t.pageTocHeading}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${heading.id}`}
              onClick={closeDrawer}
              aria-current={activeId === heading.id ? "true" : undefined}
              className={
                activeId === heading.id
                  ? "font-semibold text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              }
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
