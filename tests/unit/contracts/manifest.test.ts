import { describe, expect, it } from "vitest";
import { SlugManifestSchema } from "@/lib/contracts/manifest";

describe("SlugManifestSchema", () => {
  it("parses a manifest with lesson/quiz/exercise entries", () => {
    const result = SlugManifestSchema.safeParse({
      generatedAt: "2026-07-18T00:00:00.000Z",
      entries: [
        {
          itemType: "lesson",
          slug: "01-reliability/01-intro",
          module: "01-reliability",
        },
        {
          itemType: "exercise",
          slug: "06-partitioning/consistent-hash",
          module: "06-partitioning",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry with an invalid itemType", () => {
    const result = SlugManifestSchema.safeParse({
      generatedAt: "2026-07-18T00:00:00.000Z",
      entries: [
        {
          itemType: "chapter",
          slug: "01-reliability/01-intro",
          module: "01-reliability",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
