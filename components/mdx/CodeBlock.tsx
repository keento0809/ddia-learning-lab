"use client";

import { useState } from "react";
import { getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";

/**
 * MDXカスタムコンポーネント<CodeBlock>(T-103, 02§4.1)。
 *
 * 設計判断(依存未充足、CLAUDE.md規則10): `runnable`時の「試す」→ミニ実行は
 * lib/runner/jsRunner.tsの正式なRunner統合(T-107c)を必要とするが、
 * mainブランチのjsRunner.tsはT-000 Walking Skeleton原型のまま
 * (lib/contracts/runner.tsではなくlib/runner/types.tsという別契約を使用しており、
 * T-107aのharness.worker.tsとは型が一致しない)。T-107cは本タスク(T-103)の依存
 * 範囲外かつ未着手のため、実行結果を偽装せず(規則3)、「試す」ボタンのUIと
 * 結果パネルの枠のみを実装し、実行が未接続であることを正直に表示する。
 * T-107c完了後、この結果パネルの中身を実際のRunner呼び出しに差し替えること。
 */
export function CodeBlock({
  lang,
  runnable = false,
  children,
}: {
  lang: string;
  runnable?: boolean;
  children: string;
}) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.codeBlock;
  const [showResult, setShowResult] = useState(false);

  return (
    <div className="my-4 overflow-hidden rounded border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span>{lang}</span>
        {runnable ? (
          <button
            type="button"
            data-testid="code-block-try"
            onClick={() => setShowResult((value) => !value)}
            className="rounded bg-neutral-900 px-2 py-0.5 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {t.tryLabel}
          </button>
        ) : null}
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code data-lang={lang}>{children}</code>
      </pre>
      {runnable && showResult ? (
        <div
          data-testid="code-block-result"
          className="border-t border-neutral-200 p-3 text-sm dark:border-neutral-800"
        >
          <p className="mb-1 font-semibold">{t.resultHeading}</p>
          <p className="text-neutral-600 dark:text-neutral-400">{t.notAvailableLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
