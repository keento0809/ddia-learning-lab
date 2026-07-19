"use client";

import { useEffect, useRef, type RefObject } from "react";
import { computeScrollProgress, hasReachedThreshold } from "./scrollProgress";

export const DEFAULT_SCROLL_THRESHOLD = 0.8;

/**
 * 記事コンテナのスクロール進捗を監視し、閾値(既定80%)到達時に一度だけ
 * onThresholdを呼ぶ(T-103, 02§4.1)。API接続(実際の進捗記録)はT-105のスコープ。
 */
export function useScrollThreshold(
  containerRef: RefObject<HTMLElement | null>,
  onThreshold: () => void,
  threshold: number = DEFAULT_SCROLL_THRESHOLD,
): void {
  const firedRef = useRef(false);
  const onThresholdRef = useRef(onThreshold);
  onThresholdRef.current = onThreshold;

  useEffect(() => {
    firedRef.current = false;

    function handleScroll() {
      if (firedRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const articleTop = rect.top + window.scrollY;
      const progress = computeScrollProgress({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        articleTop,
        articleHeight: container.scrollHeight,
      });

      if (hasReachedThreshold(progress, threshold)) {
        firedRef.current = true;
        onThresholdRef.current();
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold]);
}
