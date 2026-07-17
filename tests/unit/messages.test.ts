import { describe, expect, it } from "vitest";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

describe("formatMessage", () => {
  it("interpolates known placeholders", () => {
    expect(
      formatMessage("{passed}/{total} 件のテストに合格", {
        passed: 2,
        total: 3,
      }),
    ).toBe("2/3 件のテストに合格");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(formatMessage("{unknown}", {})).toBe("{unknown}");
  });
});

describe("getMessages", () => {
  it("returns the ja catalog for locale 'ja'", () => {
    expect(getMessages("ja").lab.run).toBe("実行");
  });

  it("returns the en catalog for locale 'en'", () => {
    expect(getMessages("en").lab.run).toBe("Run");
  });
});
