import { describe, expect, it, vi } from "vitest";

/**
 * 回帰テスト(2026-07-25、smoke-test `GET /api/progress` 本番500の恒久対策)。
 * 本番(workerd)でのみ再現する「NextRequestをそのままservice binding(Fetcher)へ
 * 渡すと`TypeError: Invalid URL: [object Object]`になる」という不整合自体は
 * Node/vitest環境では再現できない(workerd固有のRequestアイデンティティ問題の
 * ため)。ここではdispatchToWorkerApiが実際に「url/method/headers/bodyのみを
 * 転送する新しいRequestインスタンス」を構築してからenv.API.fetch()へ渡している
 * ことを検証し、元のリクエストオブジェクトをそのまま素通しする実装への回帰を防ぐ。
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

describe("dispatchToWorkerApi", () => {
  it("forwards a freshly constructed Request (not the original object) to env.API.fetch, preserving url/method/headers", async () => {
    const fetchSpy = vi.fn(async (_req: Request) => new Response(JSON.stringify({ ok: true })));
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: fetchSpy } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const original = new Request("https://ddia-learning-lab.example/api/progress", {
      method: "GET",
      headers: { cookie: "authjs.session-token=abc" },
    });

    await dispatchToWorkerApi(original);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const forwarded = fetchSpy.mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded).not.toBe(original);
    expect(forwarded.url).toBe(original.url);
    expect(forwarded.method).toBe("GET");
    expect(forwarded.headers.get("cookie")).toBe("authjs.session-token=abc");
  });

  it("forwards a body with duplex:half for non-GET requests", async () => {
    const fetchSpy = vi.fn(async (_req: Request) => new Response(null, { status: 204 }));
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: fetchSpy } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const original = new Request("https://ddia-learning-lab.example/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemSlug: "demo" }),
    });

    await dispatchToWorkerApi(original);

    const forwarded = fetchSpy.mock.calls[0][0];
    expect(forwarded.method).toBe("POST");
    const body = await forwarded.text();
    expect(body).toBe(JSON.stringify({ itemSlug: "demo" }));
  });

  it("returns whatever env.API.fetch resolves to", async () => {
    const expected = new Response("hello", { status: 401 });
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: vi.fn().mockResolvedValue(expected) } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const result = await dispatchToWorkerApi(
      new Request("https://ddia-learning-lab.example/api/progress"),
    );

    expect(result).toBe(expected);
  });

  // T-712: 転送先はworker-apiの公開APIである/api/配下に限定する。
  it.each(["/other", "/api", "/api/", "/apiary/progress"])(
    "rejects %s with 404 without calling env.API.fetch",
    async (requestPath) => {
      const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
      vi.mocked(getCloudflareContext).mockResolvedValue({
        env: { API: { fetch: fetchSpy } },
      } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

      const result = await dispatchToWorkerApi(
        new Request(`https://ddia-learning-lab.example${requestPath}`),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.status).toBe(404);
      expect(result.headers.get("content-type")).toContain("application/problem+json");
      await expect(result.json()).resolves.toEqual({
        type: "about:blank#not-found",
        title: "not_found",
        status: 404,
      });
    },
  );

  it.each([
    "/api/progress",
    "/api/notes/05-replication/02-lag",
    "/api/guest-progress/import",
    "/api/submissions?exercise=05-replication%2Fquorum-lab",
  ])("forwards %s with the URL unchanged", async (requestPath) => {
    const fetchSpy = vi.fn<(req: Request) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { API: { fetch: fetchSpy } },
    } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);

    const url = `https://ddia-learning-lab.example${requestPath}`;
    await dispatchToWorkerApi(new Request(url));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0].url).toBe(url);
  });
});
