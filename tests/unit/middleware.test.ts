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
describe("middleware locale resolution", () => {
  it("URL指定: ロケールプレフィックス付きパスは他ロケールへリダイレクトしない", () => {
    const res = middleware(
      makeRequest("/ja/demo", { cookie: "NEXT_LOCALE=en", acceptLanguage: "en" }),
    );
    expect(res.status).not.toBe(307);
  });

  it("Cookieのみ: プレフィックスなしパスはCookieのロケールへ307リダイレクトする", () => {
    const res = middleware(makeRequest("/", { cookie: "NEXT_LOCALE=ja" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/ja");
  });

  it("ヘッダのみ: Cookieなしの場合Accept-Languageのロケールへ307リダイレクトする", () => {
    const res = middleware(makeRequest("/", { acceptLanguage: "ja" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/ja");
  });

  it("無指定: CookieもAccept-Languageもない場合は既定ロケール'en'へ307リダイレクトする", () => {
    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });
});
