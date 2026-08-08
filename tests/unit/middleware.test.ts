import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import middleware from "@/middleware";

function makeRequest(path: string, init?: { cookie?: string; acceptLanguage?: string }) {
  const headers = new Headers();
  if (init?.cookie) headers.set("cookie", init.cookie);
  if (init?.acceptLanguage) headers.set("accept-language", init.acceptLanguage);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

// 02§5.1: 言語解決優先順位 URL > Cookie(NEXT_LOCALE) > Accept-Language > 既定 'en'
// T-705(docs/security/findings.md Medium #4): middlewareはisAuthRateLimited
// (lib/auth/rateLimit.ts)経由でCloudflare Rate Limiting APIバインディングを
// 試みるようになったため非同期になった(tests/unit/auth/rateLimit.test.tsと
// 同じ理由)。
describe("middleware locale resolution", () => {
  it("URL指定: ロケールプレフィックス付きパスは他ロケールへリダイレクトしない", async () => {
    const res = await middleware(
      makeRequest("/ja/demo", { cookie: "NEXT_LOCALE=en", acceptLanguage: "en" }),
    );
    expect(res.status).not.toBe(307);
  });

  it("Cookieのみ: プレフィックスなしパスはCookieのロケールへ307リダイレクトする", async () => {
    const res = await middleware(makeRequest("/", { cookie: "NEXT_LOCALE=ja" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/ja");
  });

  it("ヘッダのみ: Cookieなしの場合Accept-Languageのロケールへ307リダイレクトする", async () => {
    const res = await middleware(makeRequest("/", { acceptLanguage: "ja" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/ja");
  });

  it("無指定: CookieもAccept-Languageもない場合は既定ロケール'en'へ307リダイレクトする", async () => {
    const res = await middleware(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });
});

// T-704(ADR-010 §3.4 CF-1): ページルート(intlMiddleware委譲分岐)にはCSPヘッダを
// 付与する。演習実行Worker向けの別ポリシー(connect-src 'none')は`_headers`経由
// (scripts/generate-worker-csp-headers.mjs)で適用するため、ここでは対象外。
describe("middleware CSP header", () => {
  it("ページルートのレスポンスにContent-Security-Policyヘッダを付与する", async () => {
    const res = await middleware(makeRequest("/ja/demo"));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  it("/api/auth/*のレート制限レスポンス(429)には影響しない(既存のRFC9457形式のまま)", async () => {
    const res = await middleware(new NextRequest(new URL("/api/auth/csrf", "http://localhost:3000")));
    expect(res.status).not.toBe(500);
  });
});
