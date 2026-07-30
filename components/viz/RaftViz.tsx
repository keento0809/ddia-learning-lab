"use client";

import { useEffect, useRef, useState } from "react";
import { SvgStage } from "@/components/viz/core/SvgStage";
import { Timeline } from "@/components/viz/core/Timeline";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import { createRaftEngine, raftNarratable } from "@/components/viz/raft/engine";
import { RaftSvg, RAFT_VIEW_BOX } from "@/components/viz/raft/RaftSvg";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

/**
 * RaftViz(Ch9, 02§8.2)。「5ノード。タイマー可視化、ノードクリックで停止/復帰、
 * 分断線ドラッグでパーティション作成」「状態機械はSimEngine上に実装」
 * 「課題モード: クォーラム計算問題への操作回答」を満たす。
 */
export function RaftViz() {
  const locale = useLessonLocale();
  const t = getMessages(locale).raftViz;
  const engineRef = useRef(createRaftEngine());
  const engine = engineRef.current;
  const [state, setState] = useState(() => engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  const leader = state.nodes.find((node) => node.alive && node.role === "leader");
  const isPartitioned = state.partitionSplit > 0 && state.partitionSplit < state.nodes.length;
  const aliveCount = state.nodes.filter((node) => node.alive).length;

  return (
    <div data-testid="raft-viz">
      <h2 className="text-lg font-semibold">{t.heading}</h2>
      <SvgStage viewBox={RAFT_VIEW_BOX} ariaLabel={t.svgAriaLabel}>
        <RaftSvg
          state={state}
          locale={locale}
          onToggleNode={(id) => engine.dispatch({ type: "toggleNode", id })}
          onSetPartition={(split) => engine.dispatch({ type: "setPartition", split })}
        />
      </SvgStage>

      <A11yNarrator state={state} locale={locale} narratable={raftNarratable} />

      <div data-testid="raft-partition-status">
        {isPartitioned
          ? formatMessage(t.partition.activeLabel, {
              a: state.partitionSplit,
              b: state.nodes.length - state.partitionSplit,
            })
          : t.partition.noneLabel}
      </div>

      <div role="group" aria-label={t.controls.proposeLabel} className="mt-2">
        <button
          type="button"
          data-testid="raft-propose"
          aria-disabled={!leader}
          className={`rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900 ${!leader ? "pointer-events-none opacity-50" : ""}`}
          aria-label={t.controls.proposeAriaLabel}
          onClick={() => {
            if (!leader) return;
            engine.dispatch({ type: "propose" });
          }}
        >
          {t.controls.proposeLabel}
        </button>
      </div>

      <Timeline locale={locale} onStep={() => engine.step()} onReset={() => engine.reset()} />

      <div data-testid="raft-quiz" className="mt-2">
        <button
          type="button"
          data-testid="raft-quiz-toggle"
          aria-pressed={state.quizMode}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          onClick={() => engine.dispatch({ type: "toggleQuizMode" })}
        >
          {t.quiz.toggleLabel}
        </button>

        {state.quizMode ? (
          <div data-testid="raft-quiz-panel">
            <p>{t.quiz.question}</p>
            <p data-testid="raft-quiz-alive-count">{formatMessage(t.quiz.aliveCountLabel, { count: aliveCount })}</p>
            <button
              type="button"
              data-testid="raft-quiz-submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
              onClick={() => engine.dispatch({ type: "submitQuizAnswer" })}
            >
              {t.quiz.submitLabel}
            </button>
            {state.quizResult ? (
              <p role="status" data-testid="raft-quiz-feedback">
                {state.quizResult === "correct" ? t.quiz.correctFeedback : t.quiz.incorrectFeedback}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default RaftViz;
