/**
 * viz-componentスキルのサンプル: sample-engine.ts / sample-describeState.ts に対応する
 * Reactコンポーネント本体。SvgStage・Timeline・A11yNarratorの接続形と、
 * 「既知の落とし穴」(references/pitfalls.md)への対策(aria-disabled, break-words)を
 * 1ファイルで示す最小サンプル。実在のVizではない。
 *
 * 配置場所の例: components/viz/job-queue/JobQueueViz.tsx
 */
"use client";

import { useEffect, useState } from "react";
import { SvgStage } from "@/components/viz/core/SvgStage";
import { Timeline } from "@/components/viz/core/Timeline";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { createJobQueueEngine, type JobQueueState } from "./sample-engine";
import { describeState, jobQueueNarratable } from "./sample-describeState";

const VIEW_BOX = { minX: 0, minY: 0, width: 220, height: 40 };
const SLOT_WIDTH = 40;

/**
 * pitfalls.md参照: ネイティブdisabledはフォーカスを強制的に<body>へ落とすため、
 * aria-disabled + ハンドラ側ガード節で代替する(タブ順序に残りフォーカスも奪わない)。
 */
function inertButtonProps(inert: boolean) {
  return {
    "aria-disabled": inert,
    className: inert ? "pointer-events-none opacity-50" : undefined,
  } as const;
}

export default function JobQueueViz() {
  const locale = useLessonLocale();
  const [engine] = useState(() => createJobQueueEngine());
  const [state, setState] = useState<JobQueueState>(() => engine.getState());
  useEffect(() => engine.subscribe(setState), [engine]);

  const isFull = state.items.length >= state.capacity;
  const isEmpty = state.items.length === 0;

  return (
    // pitfalls.md参照: 任意長テキスト(ジョブラベル等)を埋め込む可能性がある祖先には
    // break-wordsを置く(子要素個別のtruncateだけでは横オーバーフローを防げない)。
    <div data-testid="job-queue-viz" className="break-words">
      <SvgStage viewBox={VIEW_BOX} ariaLabel="job queue" className="h-10 w-full max-w-xs">
        {state.items.map((item, index) => (
          <rect
            key={item.id}
            x={index * SLOT_WIDTH + 2}
            y={2}
            width={SLOT_WIDTH - 4}
            height={36}
            fill="currentColor"
            opacity={0.6}
          />
        ))}
      </SvgStage>

      <button
        type="button"
        data-testid="job-queue-enqueue"
        {...inertButtonProps(isFull)}
        onClick={() => {
          if (isFull) return;
          engine.dispatch({ type: "enqueue" });
        }}
      >
        {/* 実装時は messages/{ja,en}.json 経由(絶対規則5)。ここはdescribeState.ts同様、
            メッセージファイルを新設せず読める最小サンプルとして直書きしている。 */}
        {locale === "ja" ? "投入" : "Enqueue"}
      </button>
      <button
        type="button"
        data-testid="job-queue-dequeue"
        {...inertButtonProps(isEmpty)}
        onClick={() => {
          if (isEmpty) return;
          engine.dispatch({ type: "dequeue" });
        }}
      >
        {locale === "ja" ? "取り出し" : "Dequeue"}
      </button>

      {/*
        Timelineは「自律的な時間経過」を持つVizのみ接続する(SKILL.md §4)。
        onStep/onResetにengineのstep/resetをそのまま渡すだけでよい。
      */}
      <Timeline locale={locale} onStep={() => engine.step()} onReset={() => engine.reset()} />

      <p data-testid="job-queue-event-log">{describeState(state, locale)}</p>

      <A11yNarrator state={state} locale={locale} narratable={jobQueueNarratable} />
    </div>
  );
}
