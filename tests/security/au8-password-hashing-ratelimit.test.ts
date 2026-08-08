import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isRateLimited, resetRateLimit } from "@/lib/auth/rateLimit";
import { callWorkerApi } from "./helpers/workerApi";

/**
 * T-703 AU-8(docs/design/11_ADR-011 §3.2)。パスワード: ハッシュ方式(ADR-007 C-3の
 * scryptフォールバック含む)、レート制限の実効性。
 */
describe("AU-8: パスワードハッシュ方式", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("実サインアップで保存されるpasswordHashはArgon2id(OWASP最小推奨m>=19MiB,t>=2,p=1)でエンコードされている", async () => {
    const email = `au8-${randomUUID()}@example.com`;
    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "correct horse battery staple", displayName: "AU-8" }),
      }),
    );
    expect(res.status).toBe(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    // hash-wasmのencoded出力形式: $argon2id$v=..$m=19456,t=3,p=1$<salt>$<hash>
    expect(row.passwordHash).toMatch(/\$m=19456,t=3,p=1\$/);
    expect(row.passwordHash).not.toContain("correct horse battery staple");
  });

  it("平文パスワードと完全一致するようなハッシュではない(最低限の平文非保存確認)", async () => {
    const email = `au8-plain-${randomUUID()}@example.com`;
    const password = "another-test-password-1234";
    await callWorkerApi(
      new Request("http://worker-api.internal/internal/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName: "AU-8" }),
      }),
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).not.toBe(password);
    expect(row.passwordHash!.length).toBeGreaterThan(password.length);
  });
});

describe("AU-8: 認証エンドポイントのレート制限(lib/auth/rateLimit.ts)の実効性", () => {
  afterEach(() => {
    resetRateLimit();
  });

  it("単一isolate内: 同一キーからの6回目のリクエストはブロックされる(5req/min/IP、middleware.tsが適用)", () => {
    const key = "203.0.113.10";
    const now = Date.now();
    const results = Array.from({ length: 6 }, () => isRateLimited(key, now));
    expect(results).toEqual([false, false, false, false, false, true]);
  });

  it("ウィンドウ(60秒)経過後は再びリクエストを許可する(スライディングウィンドウの動作確認)", () => {
    const key = "203.0.113.11";
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, t0)).toBe(false);
    }
    expect(isRateLimited(key, t0)).toBe(true);
    expect(isRateLimited(key, t0 + 60_001)).toBe(false);
  });

  it(
    "情報: isRateLimitedの状態はモジュールスコープのMap(単一isolateメモリ内)であり、" +
      "異なるキー(=異なるIPとみなされた別isolate/別PoPでの計測)には独立してカウントが適用される。" +
      "これはisRateLimited単体(フォールバック経路)の既知の制約であり、単一プロセスの" +
      "テスト環境ではCloudflare実配備でのisolate分散を再現できないため、本テストは" +
      "『異なるキーは独立してカウントされる』という設計上の事実のみを固定する。" +
      "T-705修正(docs/security/findings.md Medium #4): 実デプロイ環境ではisolate間で" +
      "状態を共有するCloudflare Rate Limiting APIバインディング(lib/auth/rateLimit.tsの" +
      "isAuthRateLimited、wrangler.jsoncの`AUTH_RATE_LIMITER`)を優先するようになったため、" +
      "middleware.tsはこのisRateLimited単体の制約に依存しなくなった" +
      "(tests/unit/auth/rateLimitEdgeBinding.test.ts参照。真のisolate間分散の実証は" +
      "実デプロイでのペネトレーションテストでのみ確定可能な点は変わらない)。",
    () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        expect(isRateLimited("203.0.113.12", now)).toBe(false);
      }
      expect(isRateLimited("203.0.113.12", now)).toBe(true);
      // 別キー(≒別isolateが見るIP)は独立したカウンタを持つ。
      expect(isRateLimited("203.0.113.13", now)).toBe(false);
    },
  );
});
