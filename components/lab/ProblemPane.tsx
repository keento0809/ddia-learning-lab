"use client";

import type { ReactNode } from "react";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { LabLeftTab } from "@/lib/store/labStore";
import { revealedHintCount, HINT_1_THRESHOLD, HINT_2_THRESHOLD } from "@/lib/lab/hints";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * 左ペイン(02§4.2「タブ:[課題|ヒント|解説(合格後)]」)。
 *
 * **設計との既知の差異**: `ExerciseDefinitionSchema`(lib/contracts、T-010、
 * 変更禁止)には「課題文(MDX)」に相当する自由記述の説明文フィールドが無い
 * (T-102決定事項ログが同種のギャップ(演習titleフィールド不在)を既に指摘し、
 * 「T-108以降のcontracts拡張が必要になった場合に別タスクで判断」としていた
 * 論点そのもの)。同様に「解説」に相当する自由記述フィールドも無い。
 * このため課題タブは、スキーマに実在するデータ(採点対象関数名、
 * equals/deepEquals形式テストから導出できる入出力例、timeoutMsからの制約表示)
 * のみで構成し、存在しないプローズ説明文を捏造しない。解説タブは合格後に
 * 開放されるが、内容は「この演習の解説はまだ用意されていません」という
 * 正直な空状態(T-101/T-102の「コンテンツ未投入時は空状態を描画する」慣習を踏襲)
 * とする。
 */
export function ProblemPane({
  exercise,
  activeTab,
  onTabChange,
  failCount,
  passed,
  explanationRevealed,
  onRevealExplanation,
  locale,
}: {
  exercise: ExerciseDefinition;
  activeTab: LabLeftTab;
  onTabChange: (tab: LabLeftTab) => void;
  failCount: number;
  passed: boolean;
  explanationRevealed: boolean;
  onRevealExplanation: () => void;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace;

  return (
    <div data-testid="lab-problem-pane" className="flex h-full flex-col">
      <div role="tablist" className="flex gap-2 border-b border-neutral-200 text-sm dark:border-neutral-800">
        <TabButton testId="lab-tab-problem" active={activeTab === "problem"} onClick={() => onTabChange("problem")}>
          {t.tabs.problem}
        </TabButton>
        <TabButton testId="lab-tab-hints" active={activeTab === "hints"} onClick={() => onTabChange("hints")}>
          {t.tabs.hints}
        </TabButton>
        <TabButton
          testId="lab-tab-explanation"
          active={activeTab === "explanation"}
          onClick={() => onTabChange("explanation")}
        >
          {t.tabs.explanation}
        </TabButton>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {activeTab === "problem" && <ProblemTab exercise={exercise} locale={locale} />}
        {activeTab === "hints" && <HintsTab exercise={exercise} failCount={failCount} locale={locale} />}
        {activeTab === "explanation" && (
          <ExplanationTab
            passed={passed}
            revealed={explanationRevealed}
            onReveal={onRevealExplanation}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-neutral-900 px-3 py-2 font-medium dark:border-neutral-100"
          : "px-3 py-2 text-neutral-500"
      }
    >
      {children}
    </button>
  );
}

function ProblemTab({ exercise, locale }: { exercise: ExerciseDefinition; locale: Locale }) {
  const t = getMessages(locale).labWorkspace.problem;
  const examples = exercise.tests.filter(
    (tc) => "call" in tc && (tc.assert.type === "equals" || tc.assert.type === "deepEquals"),
  );

  return (
    <div className="space-y-4">
      <p>
        {t.entryLabel}
        {": "}
        <code>{exercise.entry}</code>
      </p>
      <div>
        <h3 className="mb-1 font-medium">{t.constraintsHeading}</h3>
        <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
          <li>{formatMessage(t.timeLimitLabel, { sec: Math.round(exercise.timeoutMs / 1000) })}</li>
          <li>{formatMessage(t.testCountLabel, { count: exercise.tests.length })}</li>
        </ul>
      </div>
      <div>
        <h3 className="mb-1 font-medium">{t.examplesHeading}</h3>
        {examples.length === 0 ? (
          <p className="text-neutral-500">{t.noExamplesLabel}</p>
        ) : (
          <ul className="space-y-2">
            {examples.map((tc) => {
              if (!("call" in tc) || (tc.assert.type !== "equals" && tc.assert.type !== "deepEquals")) return null;
              return (
                <li key={tc.id} className="rounded bg-neutral-100 p-2 font-mono text-xs dark:bg-neutral-900">
                  <div>
                    {t.exampleInput}
                    {": "}
                    {JSON.stringify(tc.call.args)}
                  </div>
                  <div>
                    {t.exampleOutput}
                    {": "}
                    {JSON.stringify(tc.assert.value)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function HintsTab({
  exercise,
  failCount,
  locale,
}: {
  exercise: ExerciseDefinition;
  failCount: number;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace.hints;
  const revealed = revealedHintCount(failCount, exercise.hints.length);

  if (exercise.hints.length === 0) {
    return <p className="text-neutral-500">{t.noneAvailable}</p>;
  }

  return (
    <div data-testid="lab-hints-body">
      <ol className="list-inside list-decimal space-y-2">
        {exercise.hints.slice(0, revealed).map((hint, index) => (
          <li key={index} data-testid={`lab-hint-${index + 1}`}>
            {hint[locale]}
          </li>
        ))}
      </ol>
      {revealed < exercise.hints.length && (
        <p className="mt-3 text-neutral-500" data-testid="lab-hint-locked">
          {formatMessage(t.locked, {
            remaining: revealed === 0 ? HINT_1_THRESHOLD - failCount : HINT_2_THRESHOLD - failCount,
            n: revealed + 1,
          })}
        </p>
      )}
      {revealed === exercise.hints.length && exercise.hints.length > 0 && (
        <p className="mt-3 text-neutral-500">{t.allRevealed}</p>
      )}
    </div>
  );
}

function ExplanationTab({
  passed,
  revealed,
  onReveal,
  locale,
}: {
  passed: boolean;
  revealed: boolean;
  onReveal: () => void;
  locale: Locale;
}) {
  const t = getMessages(locale).labWorkspace.explanation;
  const unlocked = passed || revealed;

  if (!unlocked) {
    return (
      <div data-testid="lab-explanation-locked">
        <p className="mb-3 text-neutral-500">{t.locked}</p>
        <button
          type="button"
          onClick={onReveal}
          data-testid="lab-reveal-explanation"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          {t.reveal}
        </button>
      </div>
    );
  }

  return <p data-testid="lab-explanation-body">{t.notAvailable}</p>;
}
