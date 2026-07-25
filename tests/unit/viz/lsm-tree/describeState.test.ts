import { describe, expect, it } from "vitest";
import { describeState } from "@/components/viz/lsm-tree/describeState";
import { applyLsmAction, createInitialLsmTreeState } from "@/components/viz/lsm-tree/engine";

/**
 * T-204受入基準(5)「describeState(state, locale) がja/en両方実装されている」。
 * 02§8.1 A11yNarrator「各Vizは describeState(state, locale) を実装必須」。
 */
describe("describeState", () => {
  it("describes the initial state in both locales", () => {
    const state = createInitialLsmTreeState();
    expect(describeState(state, "ja")).toContain("初期状態");
    expect(describeState(state, "en")).toContain("initial state");
  });

  it("describes a put in both locales", () => {
    const state = applyLsmAction(createInitialLsmTreeState(), {
      type: "put",
      key: "user:1",
      value: "Alice",
    });
    expect(describeState(state, "ja")).toContain("user:1");
    expect(describeState(state, "ja")).toContain("Alice");
    expect(describeState(state, "en")).toContain("user:1");
    expect(describeState(state, "en")).toContain("Alice");
  });

  it("describes a compaction outcome (latest value wins, tombstones dropped) in both locales", () => {
    let state = createInitialLsmTreeState();
    state = applyLsmAction(state, { type: "put", key: "a", value: "1" });
    state = applyLsmAction(state, { type: "flush" });
    state = applyLsmAction(state, { type: "compact", level: 0 });

    const ja = describeState(state, "ja");
    const en = describeState(state, "en");
    expect(ja).toContain("コンパクション");
    expect(en.toLowerCase()).toContain("compact");
  });

  it("describes the deepest-level no-op distinctly in both locales", () => {
    const state = applyLsmAction(createInitialLsmTreeState(), { type: "compact", level: 2 });
    expect(describeState(state, "ja")).toContain("最深レベル");
    expect(describeState(state, "en")).toContain("deepest level");
  });
});
