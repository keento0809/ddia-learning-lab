import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PANE_WIDTH_PERCENT,
  MAX_PANE_WIDTH_PERCENT,
  MIN_PANE_WIDTH_PERCENT,
  clampPaneWidthPercent,
  useLabStore,
} from "@/lib/store/labStore";
import type { RunResult } from "@/lib/contracts/runner";

// labStoreはモジュールスコープのシングルトンのため、テスト間の状態漏れを防ぐために
// 各テスト前にデータ部分のみ初期化する(setState第2引数のreplace:trueはアクション
// 関数まで消し飛ばしてしまうため使わない。マージ(既定)でデータ部分のみ上書きする)。
beforeEach(() => {
  useLabStore.setState({ entries: {}, paneWidthPercent: DEFAULT_PANE_WIDTH_PERCENT });
});

describe("labStore", () => {
  it("ensureEntry seeds a fresh entry with the given initial code, idle status, no result", () => {
    useLabStore.getState().ensureEntry("slug-a", "initial code");
    const entry = useLabStore.getState().entries["slug-a"];
    expect(entry).toEqual({
      code: "initial code",
      status: "idle",
      result: null,
      requestTests: [],
      failCount: 0,
      activeLeftTab: "problem",
      activeResultTab: "tests",
      explanationRevealed: false,
    });
  });

  it("ensureEntry is a no-op if an entry already exists (does not overwrite live edits)", () => {
    useLabStore.getState().ensureEntry("slug-a", "first");
    useLabStore.getState().setCode("slug-a", "edited");
    useLabStore.getState().ensureEntry("slug-a", "second-mount-initial-code");
    expect(useLabStore.getState().entries["slug-a"].code).toBe("edited");
  });

  it("setCode updates code and resets status to idle without touching the stored result (edit preserves results, 02§4.2)", () => {
    useLabStore.getState().ensureEntry("slug-a", "x");
    const result: RunResult = { result: "pass", perTest: [], logs: [], durationMs: 1 };
    useLabStore.getState().setResult("slug-a", result, []);
    useLabStore.getState().setStatus("slug-a", "passed");

    useLabStore.getState().setCode("slug-a", "y");

    const entry = useLabStore.getState().entries["slug-a"];
    expect(entry.code).toBe("y");
    expect(entry.status).toBe("idle");
    expect(entry.result).toBe(result);
  });

  it("incrementFailCount increments monotonically across multiple runs", () => {
    useLabStore.getState().ensureEntry("slug-a", "x");
    useLabStore.getState().incrementFailCount("slug-a");
    useLabStore.getState().incrementFailCount("slug-a");
    expect(useLabStore.getState().entries["slug-a"].failCount).toBe(2);
  });

  it("resetCode restores the template, clears status/result/requestTests, keeps failCount", () => {
    useLabStore.getState().ensureEntry("slug-a", "x");
    const result: RunResult = { result: "fail", perTest: [], logs: [], durationMs: 1 };
    useLabStore.getState().setResult("slug-a", result, [{ id: "t1", args: [], expected: 1 }]);
    useLabStore.getState().setStatus("slug-a", "failed");
    useLabStore.getState().incrementFailCount("slug-a");

    useLabStore.getState().resetCode("slug-a", "template code");

    const entry = useLabStore.getState().entries["slug-a"];
    expect(entry.code).toBe("template code");
    expect(entry.status).toBe("idle");
    expect(entry.result).toBeNull();
    expect(entry.requestTests).toEqual([]);
    expect(entry.failCount).toBe(1);
  });

  it("setActiveLeftTab / setActiveResultTab / revealExplanation update only the targeted entry field", () => {
    useLabStore.getState().ensureEntry("slug-a", "x");
    useLabStore.getState().setActiveLeftTab("slug-a", "hints");
    useLabStore.getState().setActiveResultTab("slug-a", "console");
    useLabStore.getState().revealExplanation("slug-a");

    const entry = useLabStore.getState().entries["slug-a"];
    expect(entry.activeLeftTab).toBe("hints");
    expect(entry.activeResultTab).toBe("console");
    expect(entry.explanationRevealed).toBe(true);
  });

  it("actions targeting an unknown slug are safe no-ops", () => {
    expect(() => useLabStore.getState().setCode("missing", "x")).not.toThrow();
    expect(useLabStore.getState().entries["missing"]).toBeUndefined();
  });

  it("keeps independent entries per exercise slug (labStore is a slug-keyed map, 02§6)", () => {
    useLabStore.getState().ensureEntry("slug-a", "a-code");
    useLabStore.getState().ensureEntry("slug-b", "b-code");
    useLabStore.getState().setCode("slug-a", "a-edited");

    expect(useLabStore.getState().entries["slug-a"].code).toBe("a-edited");
    expect(useLabStore.getState().entries["slug-b"].code).toBe("b-code");
  });
});

describe("clampPaneWidthPercent", () => {
  it("clamps below the minimum", () => {
    expect(clampPaneWidthPercent(0)).toBe(MIN_PANE_WIDTH_PERCENT);
  });
  it("clamps above the maximum", () => {
    expect(clampPaneWidthPercent(100)).toBe(MAX_PANE_WIDTH_PERCENT);
  });
  it("passes through in-range values", () => {
    expect(clampPaneWidthPercent(50)).toBe(50);
  });

  it("setPaneWidthPercent stores a clamped value on the store", () => {
    useLabStore.getState().setPaneWidthPercent(5);
    expect(useLabStore.getState().paneWidthPercent).toBe(MIN_PANE_WIDTH_PERCENT);
  });
});
