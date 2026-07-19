import { describe, expect, it } from "vitest";
import { revealedHintCount } from "@/lib/lab/hints";

// T-108受入基準(7)「ヒント段階開放(失敗2回でHint1、5回でHint2)」
describe("revealedHintCount", () => {
  it("reveals nothing when there are no hints", () => {
    expect(revealedHintCount(10, 0)).toBe(0);
  });

  it.each([0, 1])("reveals no hints below the first threshold (failCount=%i)", (failCount) => {
    expect(revealedHintCount(failCount, 2)).toBe(0);
  });

  it.each([2, 3, 4])("reveals exactly 1 hint from the first threshold (failCount=%i)", (failCount) => {
    expect(revealedHintCount(failCount, 2)).toBe(1);
  });

  it.each([5, 6, 100])("reveals 2 hints from the second threshold (failCount=%i)", (failCount) => {
    expect(revealedHintCount(failCount, 2)).toBe(2);
  });

  it("never reveals more hints than exist, even past both thresholds", () => {
    expect(revealedHintCount(5, 1)).toBe(1);
  });
});
