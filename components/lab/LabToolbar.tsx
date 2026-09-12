"use client";

import { Button } from "@/components/ui/Button";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import type { LabStatus } from "@/lib/store/labStore";

const RUNNING_STATES: readonly LabStatus[] = ["validating", "running", "grading"];

export function LabToolbar({
  status,
  onRun,
  onReset,
  autosaving,
  locale,
  submissionInFlight = false,
}: {
  status: LabStatus;
  onRun: () => void;
  onReset: () => void;
  autosaving: boolean;
  locale: Locale;
  /**
   * T-108e qa-evaluator指摘(操作性3/5): 提出API送信中(POST /api/submissions/
   * PUT /api/progress)も実行不可にする。合格直後は状態機械上すぐ`idle`同等の
   * 再実行可能状態に戻るため、これが無いと素早い連続クリックだけで提出が
   * 二重送信される(統計テーブル汚染+進捗PUTの二重送信)。
   * `components/lesson/CompleteAndNextButton.tsx`の`disabled={mutation.isPending}`
   * と同じ考え方をこのボタンにも適用する。
   */
  submissionInFlight?: boolean;
}) {
  const t = getMessages(locale).labWorkspace.toolbar;
  const statusMessages = getMessages(locale).labWorkspace.status;
  const busy = RUNNING_STATES.includes(status) || submissionInFlight;

  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <Button
        type="button"
        onClick={onRun}
        disabled={busy}
        data-testid="lab-run-button"
        variant="primary"
        size="small"
        className="shrink-0 whitespace-nowrap"
      >
        {t.run}
        {/*
          失敗→恒久対策: ショートカット表記(⌘/Ctrl + Enter)はマウス/キーボード
          操作者向けのヒントであり、タッチ操作(pointer: coarse)では意味を持たない
          上、ボタン内で折り返して不格好になる。プライマリポインタ種別で出し分ける
          (Tailwindの`pointer-coarse:`は`@media (pointer: coarse)`に対応)。
        */}
        <span className="pointer-coarse:hidden">{` (${t.runShortcutHint})`}</span>
      </Button>
      <Button
        type="button"
        onClick={onReset}
        data-testid="lab-reset-button"
        variant="secondary"
        size="small"
        className="shrink-0 whitespace-nowrap"
      >
        {t.reset}
      </Button>
      <span
        data-testid="lab-status-label"
        className="shrink-0 whitespace-nowrap text-neutral-500"
      >
        {statusMessages[status]}
      </span>
      <span
        className="ml-auto shrink-0 whitespace-nowrap text-neutral-500"
        data-testid="lab-autosave-indicator"
      >
        {autosaving ? t.saving : t.autosaved}
      </span>
    </div>
  );
}
