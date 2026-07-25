// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LsmTreeViz from "@/components/viz/lsm-tree/LsmTreeViz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

/**
 * T-204受入基準(7)「キーボード操作可能」の裏付け: 全操作が<button>/<input>の
 * ネイティブ要素(既定でTab/Enter/Spaceに反応する)経由でのみ提供されることを、
 * 実DOM上でのクリック操作が状態遷移を起こすことを通じて検証する
 * (Timeline.test.tsxと同じ、このリポジトリの慣習に合わせたreact-dom/client + act方式)。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("LsmTreeViz", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    ({ container, root } = mountContainer());
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <LsmTreeViz />
        </LessonLocaleProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function el<T extends Element = Element>(testId: string): T {
    return container.querySelector<T>(`[data-testid="${testId}"]`)!;
  }

  it("starts with an empty memtable, WAL and all levels", () => {
    expect(el("lsm-flush").getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelectorAll('[data-testid^="lsm-memtable-node-"]')).toHaveLength(0);
  });

  it("put writes a key into the memtable via native form controls, then flush moves it to L0", async () => {
    await act(async () => {
      setInputValue(el<HTMLInputElement>("lsm-put-key"), "user:1");
      setInputValue(el<HTMLInputElement>("lsm-put-value"), "Alice");
    });
    await act(async () => {
      el<HTMLButtonElement>("lsm-put-submit").click();
    });

    expect(el("lsm-memtable-node-user:1")).not.toBeNull();
    expect(el<HTMLButtonElement>("lsm-flush").getAttribute("aria-disabled")).toBe("false");

    await act(async () => {
      el<HTMLButtonElement>("lsm-flush").click();
    });

    expect(container.querySelectorAll('[data-testid^="lsm-memtable-node-"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid^="lsm-sstable-"]')).toHaveLength(1);
    expect(el("lsm-entry-0-user:1").textContent).toContain("Alice");
  });

  it("compact keeps only the latest value for a key flushed twice", async () => {
    async function putAndFlush(key: string, value: string) {
      await act(async () => {
        setInputValue(el<HTMLInputElement>("lsm-put-key"), key);
        setInputValue(el<HTMLInputElement>("lsm-put-value"), value);
      });
      await act(async () => {
        el<HTMLButtonElement>("lsm-put-submit").click();
      });
      await act(async () => {
        el<HTMLButtonElement>("lsm-flush").click();
      });
    }

    await putAndFlush("user:1", "v1");
    await putAndFlush("user:1", "v2");
    expect(container.querySelectorAll('[data-testid^="lsm-sstable-"]')).toHaveLength(2);

    await act(async () => {
      el<HTMLButtonElement>("lsm-compact-0").click();
    });

    const level0Tables = el("lsm-level-0").querySelectorAll('[data-testid^="lsm-sstable-"]');
    expect(level0Tables).toHaveLength(0);
    const level1Entries = el("lsm-level-1").querySelectorAll('[data-testid^="lsm-entry-1-"]');
    expect(level1Entries).toHaveLength(1);
    expect(level1Entries[0].textContent).toContain("v2");
    expect(level1Entries[0].textContent).not.toContain("v1");
  });

  it("delete via the native delete form records a tombstone in the event log", async () => {
    await act(async () => {
      setInputValue(el<HTMLInputElement>("lsm-delete-key"), "user:1");
    });
    await act(async () => {
      el<HTMLButtonElement>("lsm-delete-submit").click();
    });
    expect(el("lsm-event-log").textContent).toContain("user:1");
  });

  it("reset returns to the initial empty state", async () => {
    await act(async () => {
      setInputValue(el<HTMLInputElement>("lsm-put-key"), "a");
      setInputValue(el<HTMLInputElement>("lsm-put-value"), "1");
    });
    await act(async () => {
      el<HTMLButtonElement>("lsm-put-submit").click();
    });
    expect(container.querySelectorAll('[data-testid^="lsm-memtable-node-"]')).toHaveLength(1);

    await act(async () => {
      el<HTMLButtonElement>("lsm-reset").click();
    });
    expect(container.querySelectorAll('[data-testid^="lsm-memtable-node-"]')).toHaveLength(0);
  });

  it("action buttons stay in the tab order (aria-disabled, not native disabled) while empty guard clauses keep clicking them a no-op", async () => {
    // qa-evaluator実機検証: ネイティブdisabledは、フォーカス中の要素に付与された
    // 瞬間ブラウザがフォーカスを強制的に<body>へ落とす(キーボード操作でPut→Flush→
    // Compactと連続操作する主要動線が壊れる)。aria-disabledはタブ順序に残り
    // フォーカスも奪わないため、代わりにハンドラ側のガード節で無効化する。
    expect(el<HTMLButtonElement>("lsm-flush").hasAttribute("disabled")).toBe(false);
    expect(el<HTMLButtonElement>("lsm-put-submit").hasAttribute("disabled")).toBe(false);

    await act(async () => {
      el<HTMLButtonElement>("lsm-flush").click();
    });
    // ハンドラのガード節がengine.dispatchの呼び出し自体を止めるため、状態は
    // 初期状態のまま(lastEventもnullのまま)。真にno-opであることの確認。
    expect(el("lsm-event-log").textContent).toContain("初期状態");
    expect(container.querySelectorAll('[data-testid^="lsm-sstable-"]')).toHaveLength(0);
  });
});
