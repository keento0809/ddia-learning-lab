"use client";

import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { ScenarioDefinition } from "@/lib/scenario/schema";
import { evaluateScenario, isScenarioComplete } from "@/lib/scenario/engine";
import { useCapstoneStore } from "@/lib/store/capstoneStore";

/**
 * S-06相当のキャップストーン画面(T-302)本体。
 * 参照設計: docs/design/01_基本設計書.md §3(モジュール12の分岐型シナリオ)、
 * F-08(言語切替、1クリック、状態保持)、03_実装タスク分割書.md T-302。
 *
 * `app/[locale]/learn/capstone/page.tsx`(Server Component)からビルド時生成
 * 済みのシナリオ定義(lib/scenario.ts)を受け取り、3つの設計判断の選択→
 * 全問回答後の分岐評価(lib/scenario/engine.ts、DOM非依存の純関数)→
 * 結果(verdict/score/feedback/consequences)表示を行う。QuizRunner
 * (components/quiz/QuizRunner.tsx)と同じ「選択→確定→フィードバック」の
 * UXパターン。選択状態は`useState`ではなくlib/store/capstoneStore.ts
 * (Zustand)に保持する。理由: 言語トグルは同一ルートへのクライアント側
 * `router.push`でありClient Componentは再マウントされるため、`useState`だと
 * 言語切替のたびに選択内容が消え、F-08の「状態保持」要件に違反する
 * (qa-evaluator検出、lib/store/labStore.tsと同じ対策)。サーバへの進捗送信は
 * 行わない(T-302のスコープ外、受入基準に含まれないため)。
 */
export function CapstoneScenario({
  locale,
  scenario,
}: {
  locale: Locale;
  scenario: ScenarioDefinition;
}) {
  const t = getMessages(locale).capstone;
  const selection = useCapstoneStore((state) => state.selection);
  const submitted = useCapstoneStore((state) => state.submitted);
  const select = useCapstoneStore((state) => state.select);
  const submit = useCapstoneStore((state) => state.submit);
  const reset = useCapstoneStore((state) => state.reset);

  const complete = isScenarioComplete(scenario, selection);
  const outcome = submitted && complete ? evaluateScenario(scenario, selection) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">{t.pageTitle}</h1>
      <p className="mb-6 text-neutral-600 dark:text-neutral-400">{scenario.brief[locale]}</p>

      <h2 className="mb-4 text-lg font-semibold">{t.decisionsHeading}</h2>
      <div className="flex flex-col gap-4">
        {scenario.decisions.map((decision) => {
          const groupName = `capstone-decision-${decision.id}`;
          const legendId = `${groupName}-legend`;
          return (
            <fieldset
              key={decision.id}
              data-testid={`capstone-decision-${decision.id}`}
              className="rounded border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <legend id={legendId} className="mb-3 font-semibold">
                {decision.prompt[locale]}
              </legend>
              <div role="radiogroup" aria-labelledby={legendId} className="flex flex-col gap-2">
                {decision.options.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={groupName}
                      value={option.id}
                      checked={selection[decision.id] === option.id}
                      onChange={() => select(decision.id, option.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{option.label[locale]}</span>
                      <span className="block text-neutral-600 dark:text-neutral-400">
                        {option.description[locale]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          data-testid="capstone-submit"
          disabled={!complete}
          onClick={submit}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {t.submitLabel}
        </button>
        <button
          type="button"
          data-testid="capstone-reset"
          onClick={reset}
          className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
        >
          {t.resetLabel}
        </button>
      </div>
      {!complete ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-500">{t.incompleteHint}</p>
      ) : null}

      {outcome ? (
        <div
          data-testid="capstone-result"
          role="status"
          className="mt-6 rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="font-semibold">{t.resultHeading}</h2>
          <p className="mt-2" data-testid="capstone-result-verdict">
            {t.verdictLabels[outcome.verdict]}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {formatMessage(t.scoreLabel, { score: outcome.score })}
          </p>
          <h3 className="mt-3 text-sm font-semibold">{t.feedbackHeading}</h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {outcome.feedback[locale]}
          </p>
          {outcome.consequences.length > 0 ? (
            <>
              <h3 className="mt-3 text-sm font-semibold">{t.consequencesHeading}</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-400">
                {outcome.consequences.map((consequence, index) => (
                  <li key={index}>{consequence[locale]}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
