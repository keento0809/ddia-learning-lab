import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { getDemoExercise } from "@/lib/lab/demoExercise";
import { DEFAULT_PANE_WIDTH_PERCENT, useLabStore } from "@/lib/store/labStore";

/**
 * T-108受入基準(3)(5)「3ペイン」「結果パネル」の描画確認。
 *
 * **失敗→恒久対策**: 当初labStoreへ`ensureEntry`で状態を事前投入してから
 * `renderToStaticMarkup`する設計だったが、zustandの`useSyncExternalStore`連携
 * (node_modules/zustand/esm/react.mjs)はサーバ描画パスで`getServerSnapshot`
 * (=ストア作成時点の`initialState`への固定参照。`vanilla.mjs`の`getInitialState`は
 * 後続の`setState`を反映しない)を使うため、事前の`setState`は一切反映されず
 * `entries[slug]`は常にundefinedになり、コンポーネントが空白を描画していた
 * (実アプリでもSSR〜ハイドレーション完了までの間は同じ理由で一瞬エディタが
 * 空白になりうる、という実害のある発見でもあった)。`components/lab/
 * LabWorkspace.tsx`側を「storeにエントリが無ければexerciseプロパティから
 * フォールバックする」設計に修正し、このテストは常にフォールバック経路
 * (=事前シードなしのデフォルト描画)のみを検証する。store駆動の動的状態
 * (結果表示・ヒント段階開放)は`ResultPanel.test.tsx`/`ProblemPane.test.tsx`で
 * 直接props経由(storeを介さず)に検証する。
 */
const exercise = getDemoExercise("ja");

beforeEach(() => {
  useLabStore.setState({ entries: {}, paneWidthPercent: DEFAULT_PANE_WIDTH_PERCENT });
});

describe("LabWorkspace", () => {
  it("renders the 3-pane layout (problem pane, editor pane, result panel) from exercise props alone", () => {
    const html = renderToStaticMarkup(<LabWorkspace exercise={exercise} locale="ja" />);

    expect(html).toContain('data-testid="lab-workspace"');
    expect(html).toContain('data-testid="lab-problem-pane"');
    expect(html).toContain('data-testid="lab-code-editor"');
    expect(html).toContain('data-testid="lab-result-panel"');
    expect(html).toContain('data-testid="lab-run-button"');
    expect(html).toContain('data-testid="lab-reset-button"');
    expect(html).toContain('data-testid="lab-resize-handle"');
  });

  it("derives problem-tab input/output examples from the exercise's own equals/deepEquals tests", () => {
    const html = renderToStaticMarkup(<LabWorkspace exercise={exercise} locale="ja" />);

    expect(html).toContain("clamp");
    // t1: clamp(5, 0, 10) => 5
    expect(html).toContain("[5,0,10]");
  });

  it("shows a 'not run yet' result panel before any run has happened", () => {
    const html = renderToStaticMarkup(<LabWorkspace exercise={exercise} locale="ja" />);

    expect(html).toContain("まだ実行していません");
  });

  it("renders the same fallback content in English", () => {
    const enExercise = getDemoExercise("en");
    const html = renderToStaticMarkup(<LabWorkspace exercise={enExercise} locale="en" />);

    expect(html).toContain('data-testid="lab-workspace"');
    expect(html).toContain("Not run yet");
  });
});
