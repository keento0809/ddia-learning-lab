import { describe, expect, it, vi } from "vitest";

/**
 * 回帰テスト(qa-evaluator検出、2026-07-26)。
 * getCloudflareContext()/env.API.fetch()が失敗する状況(ローカルNode.js実行時に
 * service bindingが解決できない等)で、signup/reset-request/reset-confirmの
 * 各forwarderが例外を伝播させ、Route Handlerが02§3のRFC 9457 Problem Details
 * 契約に違反する生の500(空ボディ)を返していた。各forwarderが例外を捕捉し、
 * 常にProblem Details形式のResponseを返すことを検証する。
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  resetConfirmViaWorkerApi,
  resetRequestViaWorkerApi,
  signupViaWorkerApi,
} from "@/lib/auth/workerApiAuth";

describe("workerApiAuth forwarders", () => {
  const cases = [
    { name: "signupViaWorkerApi", fn: signupViaWorkerApi },
    { name: "resetRequestViaWorkerApi", fn: resetRequestViaWorkerApi },
    { name: "resetConfirmViaWorkerApi", fn: resetConfirmViaWorkerApi },
  ];

  for (const { name, fn } of cases) {
    it(`${name} returns an RFC 9457 Problem Details response (not a thrown error) when the service binding call fails`, async () => {
      vi.mocked(getCloudflareContext).mockRejectedValue(new Error("binding unavailable"));

      const response = await fn({ email: "user@example.com" });

      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
      const body = (await response.json()) as { title?: string; status?: number };
      expect(body.title).toBe("auth_service_unavailable");
      expect(body.status).toBe(503);
    });
  }

  it("signupViaWorkerApi returns whatever env.API.fetch resolves to on success", async () => {
    const expected = new Response(JSON.stringify({ id: "u1" }), { status: 201 });
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: vi.fn().mockResolvedValue(expected) } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const response = await signupViaWorkerApi({ email: "user@example.com" });

    expect(response).toBe(expected);
  });
});
