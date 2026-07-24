"use client";

import { useEffect, useRef, useState } from "react";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

/** 02§8.1 Timeline「速度(0.5–4x)」の範囲・刻み幅 */
export const TIMELINE_MIN_SPEED = 0.5;
export const TIMELINE_MAX_SPEED = 4;
export const TIMELINE_SPEED_STEP = 0.5;

const DEFAULT_INTERVAL_MS = 1000;

export interface TimelineProps {
  locale: Locale;
  /** 再生中は speed に応じた間隔で、手動ステップ時は即座に呼ばれる */
  onStep: () => void;
  /** 指定時のみリセットボタンを表示する */
  onReset?: () => void;
  /** 速度1倍時のステップ間隔(ms) */
  intervalMs?: number;
  initialSpeed?: number;
}

/**
 * Viz共通の再生コントロールバー(02§8.1 Timeline「再生/一時停止/ステップ実行/
 * 速度(0.5–4x)」)。SimEngineそのものは持たず、step相当の処理を呼び出し元から
 * onStepとして受け取ることでどのVizのSimEngineにも接続できるようにする。
 */
export function Timeline({
  locale,
  onStep,
  onReset,
  intervalMs = DEFAULT_INTERVAL_MS,
  initialSpeed = 1,
}: TimelineProps) {
  const t = getMessages(locale).vizCore.timeline;
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);

  // 再生ループがonStepの最新の参照を使えるよう、依存配列にonStep自体は含めない
  // (呼び出し元の再レンダーごとにonStepが再生成されてもインターバルを再作成しない)。
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => onStepRef.current(), intervalMs / speed);
    return () => clearInterval(id);
  }, [isPlaying, speed, intervalMs]);

  return (
    <div role="group" aria-label={t.groupLabel} data-testid="viz-timeline">
      <button
        type="button"
        data-testid="viz-timeline-play"
        disabled={isPlaying}
        onClick={() => setIsPlaying(true)}
      >
        {t.playLabel}
      </button>
      <button
        type="button"
        data-testid="viz-timeline-pause"
        disabled={!isPlaying}
        onClick={() => setIsPlaying(false)}
      >
        {t.pauseLabel}
      </button>
      <button
        type="button"
        data-testid="viz-timeline-step"
        disabled={isPlaying}
        onClick={() => onStep()}
      >
        {t.stepLabel}
      </button>
      {onReset ? (
        <button
          type="button"
          data-testid="viz-timeline-reset"
          onClick={() => {
            setIsPlaying(false);
            onReset();
          }}
        >
          {t.resetLabel}
        </button>
      ) : null}
      <label data-testid="viz-timeline-speed-label">
        {formatMessage(t.speedLabel, { speed: speed.toFixed(1) })}
        <input
          type="range"
          aria-label={t.speedInputAriaLabel}
          data-testid="viz-timeline-speed"
          min={TIMELINE_MIN_SPEED}
          max={TIMELINE_MAX_SPEED}
          step={TIMELINE_SPEED_STEP}
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
