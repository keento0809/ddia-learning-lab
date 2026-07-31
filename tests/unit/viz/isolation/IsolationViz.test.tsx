// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IsolationViz } from "@/components/viz/isolation/IsolationViz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { VizPersistenceScopeProvider } from "@/lib/lesson/vizPersistenceContext";

/**
 * T-208受入基準「キーボード操作可能」「2トランザクションのタイムラインをドラッグで
 * 並べ替え、分離レベル選択で結果が変化する」。このリポジトリの慣習
 * (@testing-library/reactは導入せず、react-dom/client + reactのactで実DOM操作を
 * 検証する、tests/unit/viz/Timeline.test.tsx参照)に合わせる。
 *
 * 並べ替えの「キーボード操作可能」は、各操作チップに実装した「1つ前/1つ後ろに
 * 移動」ボタン(<button>、Tab+Enter/Spaceでネイティブに操作可能)のクリックで検証する
 * (ネイティブHTML5ドラッグはマウント/タッチ専用でキーボードから到達できないため、
 * 同じ並べ替えロジックをボタン経由でも提供している。IsolationViz.tsx参照)。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe("IsolationViz", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mountContainer());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function query<T extends Element>(selector: string): T {
    const el = container.querySelector<T>(selector);
    if (!el) throw new Error(`not found: ${selector}`);
    return el;
  }

  async function render(preset?: string) {
    await act(async () => {
      root.render(
        <LessonLocaleProvider locale="ja">
          <IsolationViz preset={preset} />
        </LessonLocaleProvider>,
      );
    });
  }

  it("renders the requested preset's operations and defaults to read-uncommitted", async () => {
    await render("write-skew");
    const select = query<HTMLSelectElement>('[data-testid="isolation-preset-select"]');
    expect(select.value).toBe("write-skew");
    const levelSelect = query<HTMLSelectElement>('[data-testid="isolation-level-select"]');
    expect(levelSelect.value).toBe("read-uncommitted");
    expect(container.querySelector('[data-testid="isolation-chip-t1-read-bob"]')).not.toBeNull();
  });

  it("keyboard-operable reordering: the move-earlier/move-later buttons swap adjacent cross-transaction operations", async () => {
    await render("dirty-read");

    // 既定順: t1-write, t2-read, t2-write, t1-commit, t2-commit
    const timeline = query('[data-testid="isolation-timeline"]');
    const chipsBefore = Array.from(timeline.children).map((el) => el.getAttribute("data-testid"));
    expect(chipsBefore).toEqual([
      "isolation-chip-t1-write",
      "isolation-chip-t2-read",
      "isolation-chip-t2-write",
      "isolation-chip-t1-commit",
      "isolation-chip-t2-commit",
    ]);

    // t2-read (index 1) を「1つ前に移動」ボタンで t1-write より前に動かす(異なるトランザクション同士なので許可される)
    const moveEarlierButton = query<HTMLButtonElement>('[data-testid="isolation-move-earlier-t2-read"]');
    expect(moveEarlierButton.disabled).toBe(false);
    act(() => {
      moveEarlierButton.click();
    });

    const timelineAfter = query('[data-testid="isolation-timeline"]');
    const chipsAfter = Array.from(timelineAfter.children).map((el) => el.getAttribute("data-testid"));
    expect(chipsAfter[0]).toBe("isolation-chip-t2-read");
    expect(chipsAfter[1]).toBe("isolation-chip-t1-write");
  });

  it("disables move buttons that would break a transaction's own operation order", async () => {
    await render("dirty-read");
    // t2-write (T2の2番目の操作)を「1つ前に移動」すると t2-read (T2の1番目)より前に出てしまうため無効
    const moveEarlierButton = query<HTMLButtonElement>('[data-testid="isolation-move-earlier-t2-write"]');
    expect(moveEarlierButton.disabled).toBe(true);
  });

  it("locks reordering once any step has executed", async () => {
    await render("dirty-read");
    act(() => {
      query<HTMLButtonElement>('[data-testid="viz-timeline-step"]').click();
    });
    const moveButton = query<HTMLButtonElement>('[data-testid="isolation-move-later-t2-read"]');
    expect(moveButton.disabled).toBe(true);
  });

  it("changes the result when the isolation level changes (dirty-read preset: RU allows the dirty read, RC does not)", async () => {
    await render("dirty-read");
    const levelSelect = query<HTMLSelectElement>('[data-testid="isolation-level-select"]');
    expect(levelSelect.value).toBe("read-uncommitted");

    async function runToEnd() {
      for (let i = 0; i < 5; i++) {
        act(() => {
          query<HTMLButtonElement>('[data-testid="viz-timeline-step"]').click();
        });
      }
    }

    await runToEnd();
    expect(query('[data-testid="isolation-chip-t2-read"]').textContent).toContain("50");

    act(() => {
      levelSelect.value = "read-committed";
      levelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await runToEnd();
    expect(query('[data-testid="isolation-chip-t2-read"]').textContent).toContain("100");
  });

  it("renders the a11y narrator with live region text", async () => {
    await render("dirty-read");
    expect(query('[data-testid="viz-a11y-narrator"]')).not.toBeNull();
  });
});

/**
 * 言語切替不具合(qa-evaluatorがPR#86で発見、/ja/viz-preview固有)の再現・修正確認。
 * next-intlの言語トグルは同一ルートへのクライアント側遷移だが、
 * app/[locale]/viz-preview/page.tsx はロケールごとに別々のコンパイル済みMDX
 * コンポーネントを描画するため、Reactはこのサブツリーをアンマウント→再マウント
 * する。ここではその実際の言語切替を、旧rootのunmount→新root(異なるlocale)の
 * mountとして再現し、VizPersistenceScopeProvider(02§5.1)がある場合に
 * 並べ替え・進行状況が復元されることを検証する(IsolationViz.tsx参照)。
 */
describe("IsolationViz locale-switch state persistence (02§5.1)", () => {
  function mountWithLocale(locale: "ja" | "en", scope: string | null, preset?: string): { container: HTMLDivElement; root: Root } {
    const { container, root } = mountContainer();
    const tree = (
      <LessonLocaleProvider locale={locale}>
        <IsolationViz preset={preset} />
      </LessonLocaleProvider>
    );
    act(() => {
      root.render(scope ? <VizPersistenceScopeProvider scope={scope}>{tree}</VizPersistenceScopeProvider> : tree);
    });
    return { container, root };
  }

  function timelineOrder(container: HTMLDivElement): (string | null)[] {
    const timeline = container.querySelector('[data-testid="isolation-timeline"]');
    if (!timeline) throw new Error("timeline not found");
    return Array.from(timeline.children).map((el) => el.getAttribute("data-testid"));
  }

  it("with VizPersistenceScopeProvider: reordering and step progress survive an unmount+remount across locales", async () => {
    const scope = "locale-switch-test-with-scope";
    const first = mountWithLocale("ja", scope, "dirty-read");

    act(() => {
      first.container.querySelector<HTMLButtonElement>('[data-testid="isolation-move-earlier-t2-read"]')!.click();
    });
    act(() => {
      first.container.querySelector<HTMLButtonElement>('[data-testid="viz-timeline-step"]')!.click();
    });
    const orderBeforeSwitch = timelineOrder(first.container);
    // data-status(状態そのもの)はロケール非依存で比較できる。表示テキスト
    // (isolation-chip-status)はロケールごとに翻訳されるため、ここでの比較対象
    // として使うと正しい多言語対応(≠不具合)を誤って不具合と判定してしまう。
    const statusBeforeSwitch = first.container
      .querySelector('[data-testid="isolation-chip-t2-read"]')
      ?.getAttribute("data-status");
    expect(orderBeforeSwitch[0]).toBe("isolation-chip-t2-read");
    expect(statusBeforeSwitch).toBe("done");

    // 言語切替の実態(同一スコープキーのまま、旧ロケールのツリーがアンマウントされ新ロケールで再マウントされる)を再現する
    await act(async () => {
      first.root.unmount();
    });
    first.container.remove();

    const second = mountWithLocale("en", scope, "dirty-read");
    expect(timelineOrder(second.container)).toEqual(orderBeforeSwitch);
    expect(
      second.container.querySelector('[data-testid="isolation-chip-t2-read"]')?.getAttribute("data-status"),
    ).toBe("done");

    await act(async () => {
      second.root.unmount();
    });
    second.container.remove();
  });

  it("without VizPersistenceScopeProvider (default): each mount starts fresh, unaffected by prior instances", async () => {
    const first = mountWithLocale("ja", null, "dirty-read");
    act(() => {
      first.container.querySelector<HTMLButtonElement>('[data-testid="isolation-move-earlier-t2-read"]')!.click();
    });
    expect(timelineOrder(first.container)[0]).toBe("isolation-chip-t2-read");

    await act(async () => {
      first.root.unmount();
    });
    first.container.remove();

    const second = mountWithLocale("en", null, "dirty-read");
    expect(timelineOrder(second.container)).toEqual([
      "isolation-chip-t1-write",
      "isolation-chip-t2-read",
      "isolation-chip-t2-write",
      "isolation-chip-t1-commit",
      "isolation-chip-t2-commit",
    ]);

    await act(async () => {
      second.root.unmount();
    });
    second.container.remove();
  });
});
