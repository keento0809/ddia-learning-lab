"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { RunResult } from "@/lib/contracts/runner";
import { runExercise } from "@/lib/runner/jsRunner";
import { buildRunRequest } from "@/lib/lab/buildRunRequest";
import { labTransition, outcomeFromRunResult } from "@/lib/lab/labStateMachine";
import { readDraft, writeDraft } from "@/lib/lab/draftStorage";
import { createDebouncedSaver } from "@/lib/lab/debouncedSaver";
import { useResizablePanes } from "@/lib/lab/useResizablePanes";
import { MAX_PANE_WIDTH_PERCENT, MIN_PANE_WIDTH_PERCENT, useLabStore } from "@/lib/store/labStore";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { CodeEditor } from "./CodeEditor";
import { ProblemPane } from "./ProblemPane";
import { ResultPanel } from "./ResultPanel";
import { LabToolbar } from "./LabToolbar";

/**
 * S-06 演習(ラボ)画面(T-108, 02§4.2)の中核コンポーネント。
 * 3ペイン(左=課題/ヒント/解説、右上=エディタ、右下=結果パネル)+
 * 状態機械(`lib/lab/labStateMachine.ts`)+ labStore(`lib/store/labStore.ts`)
 * によるslug単位の状態保持を統括する。
 *
 * Worker生成・タイムアウト・採点は既存実装(`lib/runner/jsRunner.ts`
 * `lib/runner/harness.worker.ts`、T-107a/c、変更禁止)にそのまま委譲する。
 * このコンポーネントは「ExerciseDefinition + code → RunRequest」の変換
 * (`lib/lab/buildRunRequest.ts`)と、結果に応じた状態遷移・失敗回数・
 * ヒント段階開放・ドラフト自動保存のオーケストレーションのみを担う。
 */
export function LabWorkspace({
  exercise,
  locale,
}: {
  exercise: ExerciseDefinition;
  locale: Locale;
}) {
  const slug = exercise.slug;
  const t = getMessages(locale).labWorkspace;

  const ensureEntry = useLabStore((state) => state.ensureEntry);
  const setCode = useLabStore((state) => state.setCode);
  const setStatus = useLabStore((state) => state.setStatus);
  const setResult = useLabStore((state) => state.setResult);
  const incrementFailCount = useLabStore((state) => state.incrementFailCount);
  const setActiveLeftTab = useLabStore((state) => state.setActiveLeftTab);
  const setActiveResultTab = useLabStore((state) => state.setActiveResultTab);
  const revealExplanation = useLabStore((state) => state.revealExplanation);
  const resetCode = useLabStore((state) => state.resetCode);
  const setPaneWidthPercent = useLabStore((state) => state.setPaneWidthPercent);
  const paneWidthPercent = useLabStore((state) => state.paneWidthPercent);
  const entry = useLabStore((state) => state.entries[slug]);

  // 失敗→恒久対策: zustand(useSyncExternalStore経由)はSSR/初回描画時に
  // `getServerSnapshot`(=ストア作成時点のinitialStateへの固定参照。以後の
  // `setState`は反映されない、node_modules/zustand/esm/vanilla.mjsの
  // `getInitialState`実装より)を返すため、`ensureEntry`をuseEffect(マウント後)
  // でしか呼んでいないと、サーバ描画〜ハイドレーション完了までの間
  // `entries[slug]`が常にundefinedになり、エディタ等が一瞬(またはSSR自体では
  // 恒久的に)空白になる。ストアへの登録を待たずに`exercise`プロパティから
  // 導出したフォールバック値で常に描画できるようにし(下記の`code`/`status`等)、
  // `entry`の有無で描画を出し分けない設計にした。
  useEffect(() => {
    const initialCode = readDraft(slug, locale) ?? exercise.template;
    ensureEntry(slug, initialCode);
    // exercise/localeはマウント時点のslugに対して一度だけ初期化すればよい
    // (以後の言語切替は別マウントになるため、依存配列はslugのみで十分)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const [autosaving, setAutosaving] = useState(false);
  const saverRef = useRef(
    createDebouncedSaver<string>((code) => {
      writeDraft(slug, locale, code);
      setAutosaving(false);
    }),
  );
  useEffect(() => {
    const saver = saverRef.current;
    return () => saver.cancel();
  }, []);

  const handleCodeChange = useCallback(
    (code: string) => {
      setCode(slug, code);
      setAutosaving(true);
      saverRef.current.trigger(code);
    },
    [setCode, slug],
  );

  const handleRun = useCallback(async () => {
    const store = useLabStore.getState();
    if (!store.entries[slug]) {
      store.ensureEntry(slug, readDraft(slug, locale) ?? exercise.template);
    }
    const current = useLabStore.getState().entries[slug];
    if (!current) return;
    const afterRun = labTransition(current.status, { type: "run" });
    if (afterRun === current.status) return; // idle以外からは実行しない(ガード)
    setStatus(slug, afterRun);

    if (current.code.trim().length === 0) {
      const emptyResult: RunResult = {
        result: "error",
        error: t.results.emptyCodeError,
        logs: [],
        durationMs: 0,
      };
      setResult(slug, emptyResult, []);
      setStatus(slug, labTransition(afterRun, { type: "validation_failed" }));
      incrementFailCount(slug);
      return;
    }
    setStatus(slug, labTransition(afterRun, { type: "validation_passed" }));

    try {
      const request = buildRunRequest(exercise, current.code);
      const result = await runExercise(request);
      setStatus(slug, labTransition("running", { type: "worker_result" }));
      const outcome = outcomeFromRunResult(result);
      setResult(slug, result, request.tests);
      setStatus(slug, labTransition("grading", { type: "graded", outcome }));
      if (outcome !== "passed") incrementFailCount(slug);
    } catch (e) {
      const errorResult: RunResult = { result: "error", error: String(e), logs: [], durationMs: 0 };
      setResult(slug, errorResult, []);
      setStatus(slug, labTransition("running", { type: "worker_result" }));
      setStatus(slug, labTransition("grading", { type: "graded", outcome: "runtime_error" }));
      incrementFailCount(slug);
    }
  }, [exercise, incrementFailCount, locale, setResult, setStatus, slug, t.results.emptyCodeError]);

  const handleReset = useCallback(() => {
    resetCode(slug, exercise.template);
    setAutosaving(true);
    saverRef.current.trigger(exercise.template);
  }, [exercise.template, resetCode, slug]);

  const { containerRef, percent, startDragging, handleKeyDown } = useResizablePanes(
    paneWidthPercent,
    setPaneWidthPercent,
  );

  const leftFlexBasis = useMemo(() => `${percent}%`, [percent]);

  // ストア未登録(SSR/ハイドレーション直後)でも`exercise`からのフォールバックで
  // 常に意味のある内容を描画する(上のuseEffectのコメント参照)。
  const code = entry?.code ?? exercise.template;
  const status = entry?.status ?? "idle";
  const result = entry?.result ?? null;
  const requestTests = entry?.requestTests ?? [];
  const failCount = entry?.failCount ?? 0;
  const activeLeftTab = entry?.activeLeftTab ?? "problem";
  const activeResultTab = entry?.activeResultTab ?? "tests";
  const explanationRevealed = entry?.explanationRevealed ?? false;

  return (
    <div
      ref={containerRef}
      data-testid="lab-workspace"
      className="flex h-[calc(100vh-8rem)] min-h-[480px] flex-col md:flex-row"
    >
      <div style={{ flexBasis: leftFlexBasis }} className="min-w-[240px] shrink-0 overflow-hidden border-b border-neutral-200 md:border-r md:border-b-0 dark:border-neutral-800">
        <ProblemPane
          exercise={exercise}
          activeTab={activeLeftTab}
          onTabChange={(tab) => setActiveLeftTab(slug, tab)}
          failCount={failCount}
          passed={status === "passed"}
          explanationRevealed={explanationRevealed}
          onRevealExplanation={() => revealExplanation(slug)}
          locale={locale}
        />
      </div>

      <div
        role="separator"
        aria-label={t.resizeHandleLabel}
        aria-orientation="vertical"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={MIN_PANE_WIDTH_PERCENT}
        aria-valuemax={MAX_PANE_WIDTH_PERCENT}
        tabIndex={0}
        data-testid="lab-resize-handle"
        onPointerDown={startDragging}
        onKeyDown={handleKeyDown}
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-neutral-200 hover:bg-neutral-300 focus:outline-2 focus:outline-offset-2 focus:outline-neutral-500 md:block dark:bg-neutral-800 dark:hover:bg-neutral-700"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <LabToolbar status={status} onRun={handleRun} onReset={handleReset} autosaving={autosaving} locale={locale} />
        <div className="min-h-[220px] flex-1 border-b border-neutral-200 dark:border-neutral-800">
          <CodeEditor value={code} onChange={handleCodeChange} onRunShortcut={handleRun} locale={locale} />
        </div>
        <div className="h-[240px] shrink-0">
          <ResultPanel
            status={status}
            result={result}
            requestTests={requestTests}
            exercise={exercise}
            activeTab={activeResultTab}
            onTabChange={(tab) => setActiveResultTab(slug, tab)}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
