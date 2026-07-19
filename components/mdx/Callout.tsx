"use client";

import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";

export type CalloutType = "info" | "warn" | "tip";

const CALLOUT_STYLES: Record<CalloutType, string> = {
  info: "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40",
  warn: "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40",
  tip: "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40",
};

/**
 * MDXカスタムコンポーネント<Callout>(T-103, 02§4.1)。注記ボックス。
 * childrenはMDX本文由来のため、ロケール別MDXファイルの時点で既に翻訳済みである
 * (02§8 i18n方針「教材本文はロケール別MDX」)。ラベル(情報/注意/ヒント)のみ
 * UIクロームとしてmessages経由で解決する(CLAUDE.md規則5)。
 */
export function Callout({
  type = "info",
  children,
}: {
  type?: CalloutType;
  children: ReactNode;
}) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.callout;

  return (
    <div role="note" className={`my-4 rounded-r border-l-4 p-4 ${CALLOUT_STYLES[type]}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
        {t[type]}
      </p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
