import { describe, expect, it } from "vitest";
import { isModuleFullyFree } from "@/lib/uiAccessTier";

/**
 * T-603(ADR-009 §3.2、層4「UI」)。S-02/S-03の鍵アイコン表示可否判定
 * (`isModuleFullyFree`)が、判定ロジック(lib/contracts/access.tsのgetLessonAccessTier、
 * T-602)と一致することを検証する。
 */
describe("isModuleFullyFree", () => {
  it("module 1(Free Tier)はtrue", () => {
    expect(isModuleFullyFree(1)).toBe(true);
  });

  it("module 2〜12(Preview/Gated)はfalse", () => {
    for (const order of [2, 3, 5, 12]) {
      expect(isModuleFullyFree(order)).toBe(false);
    }
  });
});
