import { describe, expect, it } from "vitest";
import {
  AccessTierSchema,
  getLessonAccessTier,
  isLessonFullyVisibleUnauthenticated,
  isLessonPreviewOnlyUnauthenticated,
  type LessonAccessTierInput,
} from "@/lib/contracts/access";

describe("AccessTierSchema", () => {
  it("accepts the five ADR-009 §3.1 tiers", () => {
    for (const tier of ["public", "freeTier", "preview", "gated", "authRequired"]) {
      expect(AccessTierSchema.safeParse(tier).success).toBe(true);
    }
  });

  it("rejects an unknown tier", () => {
    expect(AccessTierSchema.safeParse("premium").success).toBe(false);
  });
});

describe("getLessonAccessTier", () => {
  it("module 1(Free Tier)は全レッスンがfreeTier", () => {
    const cases: LessonAccessTierInput[] = [
      { moduleSlug: "01-reliability", moduleOrder: 1, lessonSlug: "01-reliability-and-faults", lessonOrder: 1 },
      { moduleSlug: "01-reliability", moduleOrder: 1, lessonSlug: "04-maintainability", lessonOrder: 4 },
    ];
    for (const input of cases) {
      expect(getLessonAccessTier(input)).toBe("freeTier");
    }
  });

  it("module 2〜12の第1レッスン(order===1)はpreview", () => {
    const cases: LessonAccessTierInput[] = [
      {
        moduleSlug: "02-data-models",
        moduleOrder: 2,
        lessonSlug: "01-relational-vs-document",
        lessonOrder: 1,
      },
      {
        moduleSlug: "12-capstone-design",
        moduleOrder: 12,
        lessonSlug: "01-unbundling",
        lessonOrder: 1,
      },
    ];
    for (const input of cases) {
      expect(getLessonAccessTier(input)).toBe("preview");
    }
  });

  it("module 2〜12の第1レッスン以外(order!==1)はgated", () => {
    const cases: LessonAccessTierInput[] = [
      {
        moduleSlug: "02-data-models",
        moduleOrder: 2,
        lessonSlug: "02-document-schema-flexibility",
        lessonOrder: 2,
      },
      {
        moduleSlug: "05-replication",
        moduleOrder: 5,
        lessonSlug: "03-leader-failover",
        lessonOrder: 3,
      },
    ];
    for (const input of cases) {
      expect(getLessonAccessTier(input)).toBe("gated");
    }
  });
});

describe("isLessonFullyVisibleUnauthenticated", () => {
  it("public/freeTierはtrue", () => {
    expect(isLessonFullyVisibleUnauthenticated("public")).toBe(true);
    expect(isLessonFullyVisibleUnauthenticated("freeTier")).toBe(true);
  });

  it("preview/gated/authRequiredはfalse", () => {
    expect(isLessonFullyVisibleUnauthenticated("preview")).toBe(false);
    expect(isLessonFullyVisibleUnauthenticated("gated")).toBe(false);
    expect(isLessonFullyVisibleUnauthenticated("authRequired")).toBe(false);
  });
});

describe("isLessonPreviewOnlyUnauthenticated", () => {
  it("previewのみtrue", () => {
    expect(isLessonPreviewOnlyUnauthenticated("preview")).toBe(true);
    expect(isLessonPreviewOnlyUnauthenticated("public")).toBe(false);
    expect(isLessonPreviewOnlyUnauthenticated("freeTier")).toBe(false);
    expect(isLessonPreviewOnlyUnauthenticated("gated")).toBe(false);
    expect(isLessonPreviewOnlyUnauthenticated("authRequired")).toBe(false);
  });
});
