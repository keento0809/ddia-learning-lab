"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * モバイルドロワー(T-103, 02§4.1「モバイル(<768px): 左右ペインはドロワー化」)
 * 向けのフォーカストラップ+Escapeクローズ。
 *
 * 失敗→恒久対策: qa-evaluatorの実ブラウザ検証で、ドロワー表示中もTabキーで
 * 背後の(視覚的には隠れている)本文コンテンツへフォーカスが漏れ、キーボード
 * ユーザーが現在地を見失うこと、およびEscapeキーで閉じられないことが検出
 * された。開いている間はドロワー内の要素のみをTab移動対象にし、Escapeで
 * 閉じられるようにする。
 */
export function useDrawerFocusTrap(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLElement | null> {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const initialFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initialFocusable?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  return containerRef;
}
