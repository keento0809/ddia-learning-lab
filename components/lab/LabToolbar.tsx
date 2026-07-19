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
}: {
  status: LabStatus;
  onRun: () => void;
  onReset: () => void;
  autosaving: boolean;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace.toolbar;
  const statusMessages = getMessages(locale).labWorkspace.status;
  const busy = RUNNING_STATES.includes(status);

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
