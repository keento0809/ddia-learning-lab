import { describe, expect, it } from "vitest";
import { getModuleAccessTier, isModuleFullyVisibleUnauthenticated } from "@/lib/moduleAccess";

describe("getModuleAccessTier (T-604, ADR-009 §3.1)", () => {
  it("moduleOrder===1(モジュール1)はfreeTier", () => {
    expect(getModuleAccessTier(1)).toBe("freeTier");
  });

  it("moduleOrder!==1はPreview階層を持たずgated", () => {
    expect(getModuleAccessTier(2)).toBe("gated");
    expect(getModuleAccessTier(12)).toBe("gated");
  });
});

describe("isModuleFullyVisibleUnauthenticated", () => {
  it("freeTierは未認証でも全文取得可", () => {
    expect(isModuleFullyVisibleUnauthenticated("freeTier")).toBe(true);
  });

  it("gatedは未認証では取得不可", () => {
    expect(isModuleFullyVisibleUnauthenticated("gated")).toBe(false);
  });
});
