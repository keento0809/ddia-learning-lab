import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import middleware from "@/middleware";
import { resetRateLimit } from "@/lib/auth/rateLimit";

function makeAuthRequest(path: string, ip: string, method: "GET" | "POST" = "POST") {
  const headers = new Headers({ "x-forwarded-for": ip });
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers, method });
}

/**
 * 03文書T-005受入基準「レート制限(5req/min/IP)のミドルウェアテスト」/ 02§3。
 *
 * 対象はPOSTのみ(qa-evaluatorで検出: GETの/api/auth/csrf・/api/auth/providers等も
 * 同じ予算に含めると、next-auth/reactのsignIn()が1回の試行で複数リクエストを
 * 発行するため、パスワードを打ち間違えて2回目を試しただけの正常なユーザーが
 * 制限に達してしまう。middleware.tsのコメント参照)。
 *
 * T-705(docs/security/findings.md Medium #4): middlewareはisAuthRateLimited
 * (lib/auth/rateLimit.ts)経由でCloudflare Rate Limiting APIバインディングを
 * 優先的に試みるようになったため非同期になった。このvitest(Node)環境では
 * getCloudflareContext()がバインディング未到達で例外を投げ、既存のisolate単位
 * インメモリフォールバック(isRateLimited)へ委譲されるため、本ファイルの
 * 検証内容自体は従来どおり有効(await付きの呼び出しに変更しただけ)。
 */
describe("auth rate limit middleware (/api/auth/*, 5req/min/IP, POSTのみ)", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("最初の5リクエストは通過し、6件目は429になる", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 5; i++) {
      const res = await middleware(makeAuthRequest("/api/auth/signup", ip));
      expect(res.status).not.toBe(429);
    }
    const sixth = await middleware(makeAuthRequest("/api/auth/signup", ip));
    expect(sixth.status).toBe(429);
  });

  it("IPが異なれば独立してカウントされる", async () => {
    const ipA = "203.0.113.20";
    const ipB = "203.0.113.21";
    for (let i = 0; i < 5; i++) {
      expect((await middleware(makeAuthRequest("/api/auth/signup", ipA))).status).not.toBe(429);
    }
    expect((await middleware(makeAuthRequest("/api/auth/signup", ipA))).status).toBe(429);
    expect((await middleware(makeAuthRequest("/api/auth/signup", ipB))).status).not.toBe(429);
  });

  it("/api/auth以外のパスはレート制限されない(i18nミドルウェアに委譲)", async () => {
    const ip = "203.0.113.30";
    for (let i = 0; i < 10; i++) {
      const res = await middleware(makeAuthRequest("/ja/demo", ip));
      expect(res.status).not.toBe(429);
    }
  });

  it("GET(/api/auth/csrf, /api/auth/providers等)はカウントされない", async () => {
    const ip = "203.0.113.40";
    for (let i = 0; i < 20; i++) {
      const res = await middleware(makeAuthRequest("/api/auth/csrf", ip, "GET"));
      expect(res.status).not.toBe(429);
    }
    // GETをいくら送ってもPOSTの予算は消費されないため、直後のPOSTは5回とも通過する。
    for (let i = 0; i < 5; i++) {
      expect((await middleware(makeAuthRequest("/api/auth/callback/credentials", ip))).status).not.toBe(
        429,
      );
    }
  });

  it("サインイン1回分の一連のリクエスト(GET csrf→POST callback)を2回試しても制限されない", async () => {
    // qa-evaluatorが発見した実際の回帰シナリオ: パスワードを打ち間違えて
    // signIn()をもう一度呼ぶだけの正常な操作が制限に引っかかってはならない。
    const ip = "203.0.113.50";
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await middleware(makeAuthRequest("/api/auth/providers", ip, "GET"))).status).not.toBe(
        429,
      );
      expect((await middleware(makeAuthRequest("/api/auth/csrf", ip, "GET"))).status).not.toBe(429);
      expect(
        (await middleware(makeAuthRequest("/api/auth/callback/credentials", ip))).status,
      ).not.toBe(429);
    }
  });
});
