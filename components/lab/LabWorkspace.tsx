"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import { runExercise } from "@/lib/runner/jsRunner";
import { runSqlExercise } from "@/lib/runner/sqlRunner";
import { buildRunRequest } from "@/lib/lab/buildRunRequest";
import { buildSqlRunRequest } from "@/lib/lab/buildSqlRunRequest";
import { adaptSqlRunResult } from "@/lib/lab/adaptSqlRunResult";
import { buildSubmissionRequest } from "@/lib/lab/buildSubmissionRequest";
import { labTransition, outcomeFromRunResult, type LabOutcome } from "@/lib/lab/labStateMachine";
import { readDraft, writeDraft } from "@/lib/lab/draftStorage";
import { createDebouncedSaver } from "@/lib/lab/debouncedSaver";
import { useResizablePanes } from "@/lib/lab/useResizablePanes";
import { MAX_PANE_WIDTH_PERCENT, MIN_PANE_WIDTH_PERCENT, useLabStore } from "@/lib/store/labStore";
import { postSubmission } from "@/lib/submissions/api";
import { useMarkProgressMutation } from "@/lib/progress/useMarkProgressMutation";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { Link } from "@/lib/i18n/navigation";
import { CodeEditor } from "./CodeEditor";
import { ProblemPane } from "./ProblemPane";
import { ResultPanel } from "./ResultPanel";
import { LabToolbar } from "./LabToolbar";
import { SchemaViewer } from "./SchemaViewer";

type SubmissionPhase = "idle" | "submitting" | "recorded" | "error";

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
  isAuthenticated = false,
  nextHref = "/",
}: {
  exercise: ExerciseDefinition;
  locale: Locale;
  /** 02§3.2「合格演出+次レッスン導線」向け。ログイン時のみ提出API接続を行う(T-108e) */
  isAuthenticated?: boolean;
  /** 合格演出のCTA遷移先(lib/labPage.tsのbuildLabPageData、T-108e) */
  nextHref?: string;
}) {
  const slug = exercise.slug;
  const t = getMessages(locale).labWorkspace;
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>("idle");
  // qa-evaluator指摘(操作性3/5, T-108e): 提出API送信中は「実行」を再度無効化する
  // ためのフラグ(LabToolbarのdisabledに使う)。submissionPhaseは合格パスのUI表示
  // 専用(idle/submitting/recorded/error)なため、fail/timeout時の統計目的送信も
  // 含めた「送信中かどうか」全体を別途この状態で追跡する。
  //
  // stateとrefを両方持つ理由: CodeEditorの⌘/Ctrl+Enterショートカット
  // (components/lab/CodeEditor.tsxの`onMount`)はMonacoのマウント時に一度だけ
  // `onRunShortcut`をaddCommandで束縛し、以後propが更新されても再束縛しない
  // (`onMount`はマウント時1回のみ発火する@monaco-editor/reactの仕様)。
  // `handleRun`をuseCallbackの依存配列経由でこのstateに反応させると、
  // ショートカット側は束縛時点の古いクロージャ値(常にfalse)しか見られず
  // ガードが効かなくなる。refなら`handleRun`の依存配列に加える必要が無く
  // (=handleRun自体の再生成・再束縛も不要)、常に最新値を読める。
  const [submissionInFlight, setSubmissionInFlightState] = useState(false);
  const submissionInFlightRef = useRef(false);
  const setSubmissionInFlight = useCallback((value: boolean) => {
    submissionInFlightRef.current = value;
    setSubmissionInFlightState(value);
  }, []);
  const progressMutation = useMarkProgressMutation();

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

  /**
   * 02§3.2「演習提出フロー」。全テスト合格時: POST /api/submissions(pass)→
   * PUT /api/progress(done, score:100、全合格時のみresult:"pass"のため常に100)
   * を順に送信し、両方成功したら合格演出+次レッスン導線を表示する。
   * 失敗/タイムアウト時(runtime_errorも含む、シーケンス図のelse分岐)は統計目的の
   * submission送信のみ行い(結果パネル自体の表示は変えない)、UIには反映しない。
   * 未ログイン時はどちらも送信しない(401を送りつけないため、
   * components/quiz/QuizRunner.tsx/CompleteAndNextButton.tsxと同じ方針)。
   *
   * qa-evaluator指摘(操作性3/5): 通常のJS演習は数msで採点が終わり`status`が
   * すぐ再実行可能な終端状態に戻るため、`submissionInFlight`(送信中)ガード無しでは
   * 素早い連続クリックだけでsubmission(fail/timeout時も含む)やprogress PUTが
   * 二重送信されてしまう。true→finallyでfalseに戻すガードをfail/timeoutの
   * 統計目的送信にも及ぼすため、この分岐も(呼び出し元をブロックしない前提を保ちつつ)
   * 内部でawaitする。
   */
  const recordOutcome = useCallback(
    async (outcome: LabOutcome, code: string, result: RunResult, requestTests: RunRequest["tests"]) => {
      if (!isAuthenticated) return;
      const submissionBody = buildSubmissionRequest(exercise, code, result, requestTests);

      setSubmissionInFlight(true);
      try {
        if (outcome !== "passed") {
          await postSubmission(submissionBody).catch(() => {
            // 統計目的の送信のため失敗してもユーザー操作をブロックしない
          });
          return;
        }

        setSubmissionPhase("submitting");
        try {
          await postSubmission(submissionBody);
          await progressMutation.mutateAsync({
            itemType: "exercise",
            itemSlug: exercise.slug,
            status: "done",
            score: 100,
          });
          setSubmissionPhase("recorded");
        } catch {
          setSubmissionPhase("error");
        }
      } finally {
        setSubmissionInFlight(false);
      }
    },
    [exercise, isAuthenticated, progressMutation, setSubmissionInFlight],
  );

  const handleRun = useCallback(async () => {
    // qa-evaluator指摘(操作性3/5, T-108e): ⌘/Ctrl+Enterショートカット
    // (CodeEditorのonRunShortcut)はLabToolbarのdisabledボタンを経由しないため、
    // ボタン側のガードだけでは再実行を防げない。ここでも送信中は弾く
    // (refを読む理由は上のsubmissionInFlightRef宣言部のコメント参照)。
    if (submissionInFlightRef.current) return;
    const store = useLabStore.getState();
    if (!store.entries[slug]) {
      store.ensureEntry(slug, readDraft(slug, locale) ?? exercise.template);
    }
    const current = useLabStore.getState().entries[slug];
    if (!current) return;
    const afterRun = labTransition(current.status, { type: "run" });
    if (afterRun === current.status) return; // idle以外からは実行しない(ガード)
    setStatus(slug, afterRun);
    setSubmissionPhase("idle"); // 前回実行の合格演出/エラー表示を新しい実行の間は隠す

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
      if (exercise.language === "sql") {
        // SQL演習: buildSqlRunRequest→runSqlExercise(T-201の採点Worker、変更なし)→
        // adaptSqlRunResultでRunResult形へ正規化し、以降はJS版と全く同じ状態遷移・
        // labStore書き込みに合流させる(ResultPanel/resultDiffの再利用のため)。
        const sqlRequest = buildSqlRunRequest(exercise, current.code);
        const sqlResult = await runSqlExercise(sqlRequest);
        setStatus(slug, labTransition("running", { type: "worker_result" }));
        const result = adaptSqlRunResult(sqlResult);
        const outcome = outcomeFromRunResult(result);
        // requestTestsはRunRequest["tests"]の形(id/args/expected)に合わせる。
        // argsはSQL側では未使用のため空配列固定(resultDiff.ts/ResultPanel.tsxは
        // expectedのみ参照する)。
        const requestTests: RunRequest["tests"] = sqlRequest.tests.map((t) => ({
          id: t.id,
          args: [],
          expected: t.expected,
        }));
        setResult(slug, result, requestTests);
        setStatus(slug, labTransition("grading", { type: "graded", outcome }));
        if (outcome !== "passed") incrementFailCount(slug);
        void recordOutcome(outcome, current.code, result, requestTests);
        return;
      }

      const request = buildRunRequest(exercise, current.code);
      const result = await runExercise(request);
      setStatus(slug, labTransition("running", { type: "worker_result" }));
      const outcome = outcomeFromRunResult(result);
      setResult(slug, result, request.tests);
      setStatus(slug, labTransition("grading", { type: "graded", outcome }));
      if (outcome !== "passed") incrementFailCount(slug);
      void recordOutcome(outcome, current.code, result, request.tests);
    } catch (e) {
      const errorResult: RunResult = { result: "error", error: String(e), logs: [], durationMs: 0 };
      setResult(slug, errorResult, []);
      setStatus(slug, labTransition("running", { type: "worker_result" }));
      setStatus(slug, labTransition("grading", { type: "graded", outcome: "runtime_error" }));
      incrementFailCount(slug);
      void recordOutcome("runtime_error", current.code, errorResult, []);
    }
  }, [
    exercise,
    incrementFailCount,
    locale,
    recordOutcome,
    setResult,
    setStatus,
    slug,
    t.results.emptyCodeError,
  ]);

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <LabToolbar
          status={status}
          onRun={handleRun}
          onReset={handleReset}
          autosaving={autosaving}
          locale={locale}
          submissionInFlight={submissionInFlight}
        />
        {/*
          失敗→恒久対策(T-202): このラッパーのmin-heightは、内側のCodeEditor自身が
          持つmin-h-[280px](components/lab/CodeEditor.tsx)より小さい値(220px)に
          設定されていた。SchemaViewer追加前は後続要素がResultPanel(h-[240px])のみ
          だったため症状が目立たなかったが、CodeEditorの実高さ(280px)がこのラッパー
          の許容高さ(220px)を超えてoverflowし、その60px分がすぐ下のSchemaViewerの
          見出し・テーブル名を覆い隠す(qa-evaluatorがelementFromPointで実証)。
          ラッパー側のmin-heightをCodeEditor自身の最小値と一致させることで、この
          ミスマッチによる兄弟要素への重なりを解消する。
        */}
        <div className="min-h-[280px] flex-1 border-b border-neutral-200 dark:border-neutral-800">
          <CodeEditor
            value={code}
            onChange={handleCodeChange}
            onRunShortcut={handleRun}
            locale={locale}
            language={exercise.language === "sql" ? "sql" : "javascript"}
          />
        </div>
        {exercise.language === "sql" && (
          <div className="h-[160px] shrink-0">
            <SchemaViewer setupSql={exercise.entry} locale={locale} />
          </div>
        )}
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
        {status === "passed" ? (
          <div
            data-testid="lab-submission-banner"
            role="status"
            className="shrink-0 border-t border-neutral-200 p-3 dark:border-neutral-800"
          >
            {!isAuthenticated ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t.submission.signInToSaveLabel}
              </p>
            ) : submissionPhase === "submitting" ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t.submission.submittingLabel}
              </p>
            ) : submissionPhase === "error" ? (
              <p
                role="alert"
                data-testid="lab-submission-error"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {t.submission.submitErrorLabel}
              </p>
            ) : submissionPhase === "recorded" ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {t.submission.passedCelebrationLabel}
                </p>
                <Link
                  href={nextHref}
                  prefetch={false}
                  data-testid="lab-next-lesson-link"
                  className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  {t.submission.nextLessonCta}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
