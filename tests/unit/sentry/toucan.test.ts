import { describe, expect, it, vi, afterEach } from "vitest";
import { captureWorkerError } from "@/lib/sentry/toucan";

const DUMMY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

/**
 * T-505受入基準(4): SENTRY_DSN未設定時はno-op(fetchを一切発生させない)ことを、
 * DSN設定時は実際に送信を試みる(fetchが呼ばれる)ことと対比して検証する。
 * toucan-jsのFetchTransport(node_modules/toucan-js/dist/index.esm.js
 * makeFetchTransport)はcaptureException経由でグローバルfetchを呼ぶため、
 * 実ネットワークへ到達させずに検証できるようfetchをスタブする。
 */
describe("captureWorkerError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dsn未設定時はfetchを呼ばない", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(() =>
      captureWorkerError(new Error("boom"), { dsn: undefined }),
    ).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dsn設定時はSentryへ送信しようとする(fetchが呼ばれる)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    let sendPromise: Promise<unknown> | undefined;

    captureWorkerError(new Error("boom"), {
      dsn: DUMMY_DSN,
      userId: "user-1",
      tags: { routePath: "/api/progress", method: "GET" },
      waitUntil: (p) => {
        sendPromise = p;
      },
    });

    await sendPromise;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("o0.ingest.sentry.io");
  });
});
