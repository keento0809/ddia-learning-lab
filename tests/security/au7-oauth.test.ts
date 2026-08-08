import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { callWorkerApi, createTestUser } from "./helpers/workerApi";

/**
 * T-703 AU-7(docs/design/11_ADR-011 §3.2)。OAuth: state/PKCE、リダイレクトURIの
 * 検証、アカウントリンクの安全性。
 *
 * state/PKCEはAuth.js v5のGitHub/Googleプロバイダが標準で有効化する
 * (`checks: ["pkce", "state"]`が既定)。next-authのプロバイダファクトリは
 * checksを内部正規化時に付与するため実行時にlib/auth/config.tsが生成した
 * providerオブジェクト単体から観測できない(next-auth/lib/providers.ts内部で
 * mergeされる)。そのためソースコード上、lib/auth/config.tsがGitHub()/Google()の
 * 呼び出しで`checks`を明示的に上書き・無効化していないことを確認する
 * (上書きしていれば既定のpkce/state保護が失われる)。
 */
describe("AU-7: OAuth state/PKCE設定", () => {
  it("lib/auth/config.tsはGitHub/Googleプロバイダのchecks(既定pkce+state)を上書きしていない", () => {
    const source = readFileSync("lib/auth/config.ts", "utf-8");
    expect(source).not.toMatch(/checks\s*:/);
  });

  it("trustHost:trueが設定されている(Cloudflare Workers経由デプロイでのHost/X-Forwarded-Host解決に必要な既知のフラグ。" +
    "エッジがこれらのヘッダを正しく設定する前提が崩れるとredirect URI検証が弱まるため、デプロイ設定側の前提として記録する)", () => {
    const source = readFileSync("lib/auth/config.ts", "utf-8");
    expect(source).toMatch(/trustHost:\s*true/);
  });
});

/**
 * OAuthアカウントの自動リンク(workers/api/src/routes/internalAuth.tsの
 * oauth-upsert)は、providerAccountIdでの既存紐付けが無い場合、claimed emailで
 * 既存ユーザーを検索し、確認なしにOAuthアカウントをリンクする。email_verified等の
 * 検証はスキーマ(OAuthUpsertRequestSchema)にもロジックにも存在しない。
 * この挙動を実際のリクエストで再現し、期待される安全な挙動(未確認のリンクを
 * 拒否する、または追加確認を要求する)との差分を明らかにする。
 */
describe("AU-7: OAuthアカウントの自動リンク(email一致のみでの紐付け)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    "パスワード認証で作成済みの既存アカウントに、確認なしでOAuthアカウントが自動リンクされてはならない" +
      "(現状は自動リンクされるため、このテストは突破可能な項目として失敗する — T-705で要対応)",
    async () => {
      const existingUser = await createTestUser();
      const providerAccountId = randomUUID();

      const res = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/oauth-upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "github",
            providerAccountId,
            // 攻撃者が(GitHub上で未確認、または攻撃者が管理する)メールアドレスとして
            // 被害者のメールアドレスを騙るシナリオを想定する。
            email: existingUser.email,
            name: "Attacker Controlled Display Name",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };

      // 安全な挙動: 未確認のメール一致だけでは既存アカウントにリンクせず、
      // (a) 別ユーザーとして扱う、または(b) 追加確認ステップを要求し、
      // 少なくとも既存ユーザーのidをそのまま返さないことを期待する。
      expect(body.id).not.toBe(existingUser.id);

      const account = await prisma.oauthAccount.findUnique({
        where: { provider_providerAccountId: { provider: "github", providerAccountId } },
      });
      expect(account?.userId).not.toBe(existingUser.id);
    },
  );
});
