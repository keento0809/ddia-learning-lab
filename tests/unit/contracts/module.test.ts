import { describe, expect, it } from "vitest";
import { ModuleMetaSchema } from "@/lib/contracts/module";

describe("ModuleMetaSchema", () => {
  it("parses a valid module.yaml payload", () => {
    const result = ModuleMetaSchema.safeParse({
      slug: "01-reliability",
      title: "信頼性の基礎",
      order: 1,
      minutes: 45,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing required fields", () => {
    const result = ModuleMetaSchema.safeParse({
      slug: "01-reliability",
      title: "信頼性の基礎",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive order", () => {
    const result = ModuleMetaSchema.safeParse({
      slug: "01-reliability",
      title: "信頼性の基礎",
      order: 0,
      minutes: 45,
    });
    expect(result.success).toBe(false);
  });
});
