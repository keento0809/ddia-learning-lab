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
 * oauth-upsert)は、providerAccountIdでの既存紐付けが無い場合、以前はclaimed
 * emailで既存ユーザーを検索し、確認なしにOAuthアカウントをリンクしていた
 * (email_verified等の検証はスキーマ(OAuthUpsertRequestSchema)にもロジックにも
 * 存在しなかった)。
 *
 * T-705修正(docs/security/findings.md Medium #3、CWE-287): email一致のみでの
 * 既存アカウントへの自動リンクを一律廃止し、409(oauth_account_link_conflict)を
 * 返すように変更した。新規メールアドレスのOAuthサインインは従来どおり新規
 * ユーザーとして作成される(この方式を選んだ理由: OAuthUpsertRequestSchemaに
 * email_verified相当の入力がなく、プロバイダ側の検証状態に依存せず一律で
 * 安全側に倒せるため。lib/auth/config.tsのjwtコールバックはnull応答時に
 * サインイン自体を失敗させる)。
 */
describe("AU-7: OAuthアカウントの自動リンク(email一致のみでの紐付け)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("防御が効く(T-705修正済み): パスワード認証で作成済みの既存アカウントに、確認なしでOAuthアカウントが自動リンクされない(409を返し、リンクも作成しない)", async () => {
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
    expect(res.status).toBe(409);
    const body = (await res.json()) as { title?: string };
    expect(body.title).toBe("oauth_account_link_conflict");

    const account = await prisma.oauthAccount.findUnique({
      where: { provider_providerAccountId: { provider: "github", providerAccountId } },
    });
    expect(account).toBeNull();
  });

  it("防御が効く(回帰確認): 新規メールアドレスでのOAuthサインインは従来どおり新規ユーザーとして作成・リンクされる", async () => {
    const email = `au7-oauth-new-${randomUUID()}@example.com`;
    const providerAccountId = randomUUID();

    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/auth/oauth-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "github", providerAccountId, email, name: "New OAuth User" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; email: string };
    expect(body.email).toBe(email);

    const account = await prisma.oauthAccount.findUnique({
      where: { provider_providerAccountId: { provider: "github", providerAccountId } },
    });
    expect(account?.userId).toBe(body.id);
  });
});
