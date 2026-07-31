"use client";

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
    <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        data-testid="lab-run-button"
        className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {`${t.run} (${t.runShortcutHint})`}
      </button>
      <button
        type="button"
        onClick={onReset}
        data-testid="lab-reset-button"
        className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700"
      >
        {t.reset}
      </button>
      <span data-testid="lab-status-label" className="text-neutral-500">
        {statusMessages[status]}
      </span>
      <span className="ml-auto text-neutral-500" data-testid="lab-autosave-indicator">
        {autosaving ? t.saving : t.autosaved}
      </span>
    </div>
  );
}
