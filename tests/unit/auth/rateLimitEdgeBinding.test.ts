import { describe, expect, it, vi } from "vitest";

/**
 * T-705 Medium #4(docs/security/findings.md)。lib/auth/rateLimit.tsの
 * isAuthRateLimitedが、Cloudflare Rate Limiting APIバインディング
 * (wrangler.jsoncの`AUTH_RATE_LIMITER`、isolate間で状態を共有するエッジ側の
 * カウンタ)が到達可能な場合にそれを優先し、isolate単位のインメモリ
 * フォールバック(isRateLimited)へは委譲しないことを検証する
 * (tests/unit/auth/rateLimit.test.tsはバインディング未到達時のフォールバック
 * 経路を検証しているため、意図的に別ファイルにしている。
 * tests/unit/auth/workerApiAuth.test.tsと同じ理由でgetCloudflareContextを
 * モックする)。
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthRateLimited, isRateLimited, resetRateLimit } from "@/lib/auth/rateLimit";

describe("isAuthRateLimited: Cloudflare Rate Limiting APIバインディングの優先利用", () => {
  it("バインディングがsuccess:falseを返す場合、isolate単位のインメモリカウンタを一切消費せずブロックする", async () => {
    resetRateLimit();
    const limit = vi.fn().mockResolvedValue({ success: false });
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { AUTH_RATE_LIMITER: { limit } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const blocked = await isAuthRateLimited("203.0.113.99");

    expect(blocked).toBe(true);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.99" });
    // インメモリフォールバックは消費されていない(バインディングのみで判定された)。
    expect(isRateLimited("203.0.113.99")).toBe(false);
  });

  it("バインディングがsuccess:trueを返す場合は通過する", async () => {
    resetRateLimit();
    const limit = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { AUTH_RATE_LIMITER: { limit } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const blocked = await isAuthRateLimited("203.0.113.98");

    expect(blocked).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.98" });
  });

  it("バインディングに到達できない場合(next dev単体・vitest等)、isolate単位のフォールバックに委譲する", async () => {
    resetRateLimit();
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error("binding unavailable"));

    for (let i = 0; i < 5; i++) {
      expect(await isAuthRateLimited("203.0.113.97")).toBe(false);
    }
    expect(await isAuthRateLimited("203.0.113.97")).toBe(true);
  });

  it("T-705修正: バインディングには到達できるが`.limit()`呼び出し自体が例外を投げる場合、「未到達」とは区別してfail-closed(即ブロック)しログを残す", async () => {
    resetRateLimit();
    const limit = vi.fn().mockRejectedValue(new Error("key exceeds maximum length"));
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { AUTH_RATE_LIMITER: { limit } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // 「未到達」経路(isolateフォールバックの閾値5)とは違い、1回目から即ブロックされる。
    expect(await isAuthRateLimited("203.0.113.96")).toBe(true);
    // インメモリフォールバックは消費されていない(fail-closedはバインディング呼び出し
    // 失敗のみで判定される。フォールバックへ委譲していない証拠)。
    expect(isRateLimited("203.0.113.96")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
