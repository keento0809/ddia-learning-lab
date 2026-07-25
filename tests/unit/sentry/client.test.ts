import { describe, expect, it, vi, beforeEach } from "vitest";
import * as SentryBrowser from "@sentry/browser";

vi.mock("@sentry/browser", () => ({ init: vi.fn() }));

import { initClientSentry } from "@/lib/sentry/client";

/**
 * T-505受入基準(4): NEXT_PUBLIC_SENTRY_DSN未設定時はSentry.init自体を呼ばない
 * (SDK内部の副作用が一切発生しないno-op)ことを検証する。
 */
describe("initClientSentry", () => {
  beforeEach(() => {
    vi.mocked(SentryBrowser.init).mockClear();
  });

  it("DSN未設定時はSentry.initを呼ばない", () => {
    initClientSentry(undefined);
    expect(SentryBrowser.init).not.toHaveBeenCalled();
  });

  it("DSN設定時はそのDSNでSentry.initを呼ぶ", () => {
    const dsn = "https://examplePublicKey@o0.ingest.sentry.io/0";
    initClientSentry(dsn);
    expect(SentryBrowser.init).toHaveBeenCalledWith({ dsn });
  });
});
