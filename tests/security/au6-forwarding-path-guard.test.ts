import { describe, expect, it, vi } from "vitest";

/**
 * T-712 AU-6(docs/design/11_ADR-011 §3.2)。worker-appの転送経路が、エンコードされた
 * パスを使っても/api/配下以外へ到達しないことを固定する回帰テスト。
 * tests/integration/setup.tsはdispatchToWorkerApiをモックするため、ここでは
 * importActualで実装本体を検証する。
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";

const { dispatchToWorkerApi } = await vi.importActual<
  typeof import("@/lib/api/workerApiDispatch")
>("@/lib/api/workerApiDispatch");

describe("AU-6: 転送パスの境界", () => {
  it.each([
    "/api/%2e%2e/internal/session",
    "/api/.%2E/health",
    "/api/x/%2e%2e/%2e%2e/internal/auth/verify-credentials",
    "/api/..%2fhealth",
    "/api/%2e%2e%2finternal%2fsession",
    "/api/..%5chealth",
    "/api/notes/%2e%2e",
    "/api/notes/%ZZ",
  ])("%s はworker-apiへ転送されない", async (requestPath) => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: fetchSpy } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const result = await dispatchToWorkerApi(
      new Request(`https://ddia-learning-lab.example${requestPath}`),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe(404);
  });
});
