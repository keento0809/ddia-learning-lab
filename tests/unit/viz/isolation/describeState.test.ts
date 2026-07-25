import { describe, expect, it } from "vitest";
import { createIsolationState, step } from "@/components/viz/isolation/engine";
import { isolationNarrator } from "@/components/viz/isolation/describeState";

/**
 * T-208受入基準「describeState(state, locale)がja/en両方実装されている」
 * (02§8.1 A11yNarrator「各Vizは describeState(state, locale) を実装必須」)。
 */
describe("isolationNarrator.describeState", () => {
  it("produces distinct, non-empty text for ja and en at the initial state", () => {
    const state = createIsolationState("dirty-read", "read-uncommitted");
    const ja = isolationNarrator.describeState(state, "ja");
    const en = isolationNarrator.describeState(state, "en");

    expect(ja.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(ja).not.toBe(en);
    expect(ja).toContain("0/5");
    expect(en).toContain("0/5");
  });

  it("mentions a dirty read in both locales once T2 dirty-reads T1's uncommitted write", () => {
    let state = createIsolationState("dirty-read", "read-uncommitted");
    state = step(state); // t1-write
    state = step(state); // t2-read (dirty)

    const ja = isolationNarrator.describeState(state, "ja");
    const en = isolationNarrator.describeState(state, "en");

    expect(ja).toContain("ダーティリード");
    expect(en.toLowerCase()).toContain("dirty read");
  });

  it("mentions an abort in both locales once a transaction is aborted due to a conflict", () => {
    let state = createIsolationState("dirty-read", "serializable");
    for (let i = 0; i < 5; i++) {
      state = step(state);
    }
    expect(state.txns.T2.status).toBe("aborted");

    const ja = isolationNarrator.describeState(state, "ja");
    const en = isolationNarrator.describeState(state, "en");

    expect(ja).toContain("アボート");
    expect(en.toLowerCase()).toContain("aborted");
  });

  it("mentions a blocked operation while a write is waiting on another transaction's lock", () => {
    let state = createIsolationState("dirty-read", "read-committed");
    state = step(state); // t1-write
    state = step(state); // t2-read
    state = step(state); // t2-write attempt blocks, t1-commit executes instead
    expect(state.blockedOpId).toBe("t2-write");

    const ja = isolationNarrator.describeState(state, "ja");
    const en = isolationNarrator.describeState(state, "en");

    expect(ja).toContain("ブロック");
    expect(en.toLowerCase()).toContain("blocked");
  });
});
