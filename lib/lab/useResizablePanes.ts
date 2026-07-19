"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampPaneWidthPercent } from "@/lib/store/labStore";

/** 矢印キー1回あたりのペイン幅調整幅(pt)。 */
const KEYBOARD_STEP_PERCENT = 2;

/**
 * 3ペインレイアウトの左右幅ドラッグ(02§4.2「左 38%(可変)」)。
 * ポインタドラッグ中の中間値はローカルstateで即座に反映し、ドラッグ終了時に
 * ストア(`onCommit`)へ確定値を書き込む(ドラッグ中に毎フレームZustandを
 * 更新する必要が無いための最適化)。
 */
export function useResizablePanes(initialPercent: number, onCommit: (percent: number) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [percent, setPercent] = useState(initialPercent);
  const draggingRef = useRef(false);
  // ドラッグ終了時にストアへ書き込む確定値を保持する。setState updater内から
  // 副作用(onCommit、Zustandへの書き込み)を呼ぶと「レンダー中に別コンポーネント
  // を更新しようとしている」というReact警告になる(setStateのupdater関数は
  // レンダーフェーズで呼ばれるため、純粋であるべき)。実ブラウザでのドラッグ
  // 操作確認(verify-webapp)でこの警告を検出したため、確定値をrefで別途追跡し
  // pointerupのイベントハンドラ(レンダー外)から直接onCommitを呼ぶよう修正した。
  const latestPercentRef = useRef(initialPercent);

  useEffect(() => {
    if (!draggingRef.current) setPercent(initialPercent);
  }, [initialPercent]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const next = clampPaneWidthPercent(((event.clientX - rect.left) / rect.width) * 100);
    latestPercentRef.current = next;
    setPercent(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    onCommit(latestPercentRef.current);
  }, [handlePointerMove, onCommit]);

  const startDragging = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  /**
   * 失敗→恒久対策: qa-evaluatorの実ブラウザ検証で、リサイズハンドル
   * (`role="separator"`)がポインタドラッグでしか操作できず、キーボードのみでの
   * 操作完結という要件を満たしていないことを検出した。矢印キーで
   * `KEYBOARD_STEP_PERCENT`ずつ幅を調整できるようにする(WAI-ARIA
   * `separator`ロールの慣例どおり)。
   */
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      let next: number | null = null;
      if (event.key === "ArrowLeft") next = clampPaneWidthPercent(percent - KEYBOARD_STEP_PERCENT);
      else if (event.key === "ArrowRight") next = clampPaneWidthPercent(percent + KEYBOARD_STEP_PERCENT);
      if (next === null) return;
      event.preventDefault();
      latestPercentRef.current = next;
      setPercent(next);
      onCommit(next);
    },
    [percent, onCommit],
  );

  return { containerRef, percent, startDragging, handleKeyDown };
}
