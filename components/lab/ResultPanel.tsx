"use client";

import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import type { LabResultTab, LabStatus } from "@/lib/store/labStore";
import { buildTestDiff, formatDisplayValue } from "@/lib/lab/resultDiff";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * 結果パネル(02§4.2「タブ: テスト | コンソール」)。
 * 失敗テストは期待値/実際の値/簡易diff(`lib/runner/grader.ts`のdiffValuesを
 * `lib/lab/resultDiff.ts`経由で再利用)を表示する。
 */
export function ResultPanel({
  status,
  result,
  requestTests,
  exercise,
  activeTab,
  onTabChange,
  locale,
}: {
  status: LabStatus;
  result: RunResult | null;
  requestTests: RunRequest["tests"];
  exercise: ExerciseDefinition;
  activeTab: LabResultTab;
  onTabChange: (tab: LabResultTab) => void;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace.results;

  const testNameFor = (id: string): string => {
    const testCase = exercise.tests.find((tc) => tc.id === id);
    if (testCase && "name" in testCase && testCase.name) return testCase.name[locale];
    return id;
  };

  return (
    <div data-testid="lab-result-panel" className="flex h-full flex-col">
      <div role="tablist" className="flex gap-2 border-b border-neutral-200 text-sm dark:border-neutral-800">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tests"}
          data-testid="lab-result-tab-tests"
          onClick={() => onTabChange("tests")}
          className={
            activeTab === "tests"
              ? "border-b-2 border-neutral-900 px-3 py-2 font-medium dark:border-neutral-100"
              : "px-3 py-2 text-neutral-500"
          }
        >
          {t.tabs.tests}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "console"}
          data-testid="lab-result-tab-console"
          onClick={() => onTabChange("console")}
          className={
            activeTab === "console"
              ? "border-b-2 border-neutral-900 px-3 py-2 font-medium dark:border-neutral-100"
              : "px-3 py-2 text-neutral-500"
          }
        >
          {t.tabs.console}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-sm" data-testid="lab-result-body">
        {activeTab === "tests" ? (
          <TestsTabBody
            status={status}
            result={result}
            requestTests={requestTests}
            testNameFor={testNameFor}
            locale={locale}
          />
        ) : (
          <ConsoleTabBody result={result} t={t} />
        )}
      </div>
    </div>
  );
}

function TestsTabBody({
  status,
  result,
  requestTests,
  testNameFor,
  locale,
}: {
  status: LabStatus;
  result: RunResult | null;
  requestTests: RunRequest["tests"];
  testNameFor: (id: string) => string;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace.results;

  if (!result) {
    return <p className="text-neutral-500">{t.notRunYet}</p>;
  }

  if (result.result === "timeout") {
    return <p data-testid="lab-status-message">{getMessages(locale).labWorkspace.status.timeout}</p>;
  }

  if (result.result === "error") {
    return (
      <p data-testid="lab-status-message">
        {`${getMessages(locale).labWorkspace.status.runtime_error}: ${result.error}`}
      </p>
    );
  }

  const passed = result.perTest.filter((test) => test.pass).length;

  return (
    <div>
      <p data-testid="lab-status-message" className="mb-2 font-medium">
        {status === "passed" ? getMessages(locale).labWorkspace.status.passed : getMessages(locale).labWorkspace.status.failed}
      </p>
      <p className="mb-3 text-neutral-600 dark:text-neutral-400">
        {formatMessage(t.testsPassed, { passed, total: result.perTest.length })}
        {" · "}
        {formatMessage(t.durationLabel, { ms: result.durationMs })}
      </p>
      <ul className="space-y-2">
        {result.perTest.map((test) => {
          const diff = buildTestDiff(test, requestTests);
          return (
            <li key={test.id} data-testid={`lab-test-result-${test.id}`}>
              <span>{test.pass ? "✓" : "✗"}</span> {testNameFor(test.id)}
              {!test.pass && diff && (
                <div className="mt-1 rounded bg-neutral-100 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-neutral-900">
                  <div>
                    {t.expectedLabel}
                    {": "}
                    {formatDisplayValue(diff.expected)}
                  </div>
                  <div>
                    {t.actualLabel}
                    {": "}
                    {formatDisplayValue(diff.actualParsed)}
                  </div>
                  <div data-testid={`lab-test-diff-${test.id}`}>
                    {t.diffLabel}
                    {": "}
                    {diff.diff}
                  </div>
                </div>
              )}
              {!test.pass && test.error && (
                <div className="mt-1 rounded bg-neutral-100 p-2 font-mono text-xs dark:bg-neutral-900">
                  {test.error}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConsoleTabBody({
  result,
  t,
}: {
  result: RunResult | null;
  t: ReturnType<typeof getMessages>["labWorkspace"]["results"];
}) {
  if (!result || result.logs.length === 0) {
    return <p className="text-neutral-500">{t.noLogs}</p>;
  }

  return (
    <ul className="space-y-1 font-mono text-xs" data-testid="lab-console-logs">
      {result.logs.map((entry, index) => (
        <li key={index} data-level={entry.level}>
          {`[${entry.level}] ${entry.args.join(" ")}`}
        </li>
      ))}
    </ul>
  );
}
