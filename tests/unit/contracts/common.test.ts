import { describe, expect, it } from "vitest";
import { LocaleSchema, LocalizedTextSchema, ProblemDetailsSchema } from "@/lib/contracts/common";

describe("LocaleSchema", () => {
  it("accepts 'ja' and 'en'", () => {
    expect(LocaleSchema.safeParse("ja").success).toBe(true);
    expect(LocaleSchema.safeParse("en").success).toBe(true);
  });

  it("rejects an unsupported locale", () => {
    expect(LocaleSchema.safeParse("fr").success).toBe(false);
  });
});

describe("LocalizedTextSchema", () => {
  it("parses a valid ja/en pair", () => {
    const result = LocalizedTextSchema.safeParse({ ja: "こんにちは", en: "Hello" });
    expect(result.success).toBe(true);
  });

  it("rejects when the en field is missing", () => {
    const result = LocalizedTextSchema.safeParse({ ja: "こんにちは" });
    expect(result.success).toBe(false);
  });
});

describe("ProblemDetailsSchema", () => {
  it("parses a minimal RFC 9457 payload", () => {
    const result = ProblemDetailsSchema.safeParse({
      type: "https://example.com/probs/slug-unknown",
      title: "Unknown slug",
      status: 409,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-numeric status", () => {
    const result = ProblemDetailsSchema.safeParse({
      type: "about:blank",
      title: "Unknown slug",
      status: "409",
    });
    expect(result.success).toBe(false);
  });
});
