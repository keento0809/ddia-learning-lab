import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { callWorkerApi, createTestUser } from "./helpers/workerApi";

/**
 * T-703 AU-8関連の重大所見(docs/design/11_ADR-011 §3.2、パスワードのレート制限・
 * 資格情報回復フローの実効性)。
 *
 * 修正前: app/api/auth/reset/request/route.ts(worker-apiの/internal/auth/
 * reset-request、workers/api/src/routes/internalAuth.ts)は、メール送信基盤が
 * 存在しないという理由でパスワードリセットトークンをHTTPレスポンスのJSONボディへ
 * 直接返す設計になっていた。これは「メールアドレスの所有証明」というリセット
 * フロー本来の前提を満たさないまま、対象メールアドレスを知っているだけの第三者に
 * 有効なリセットトークンを発行してしまい、完全なアカウント乗っ取りが成立していた
 * (ADR-011 §5の深刻度基準で「認証バイパス」= Critical、公開不可)。
 *
 * T-705修正(docs/security/findings.md): workers/api/src/routes/internalAuth.tsの
 * `/reset-request`は、メール送信基盤が導入されるまでトークンを一切発行・返却しない
 * ように変更した(メールアドレスの登録有無にかかわらず常に`resetToken: null`を
 * 返す)。これにより本ファイルの各テストは「攻撃が成立する」ことを固定する
 * 回帰テストから、「防御が成立する」ことを検証するテストへ書き換えている
 * (期待値の書き換えではなく実装修正が先。T-705 sandbox-hardening PR#110と同じ手法)。
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
    "防御が効く(T-705修正済み): resetTokenが取得できないため、被害者のメール" +
      "アドレスしか知らない攻撃者はreset-confirmへ進めず、被害者のパスワードは" +
      "変更されない(旧パスワードでのログインが引き続き成功する)",
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
      expect(resetToken, "修正後はresetTokenがレスポンスに含まれない").toBeNull();

      // 攻撃者はトークンを持たないため、null/欠損トークンでreset-confirmを叩く
      // しかない。これはinvalid_or_expired_tokenとして拒否される。
      const confirmRes = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/reset-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password: attackerChosenPassword }),
        }),
      );
      expect(confirmRes.status).toBe(400);

      const victimLoginWithOldPassword = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/verify-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email, password: victim.password }),
        }),
      );
      expect(victimLoginWithOldPassword.status).toBe(200);

      const attackerLoginWithChosenPassword = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/verify-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email, password: attackerChosenPassword }),
        }),
      );
      expect(attackerLoginWithChosenPassword.status).toBe(401);
    },
  );

  it("防御が効く(T-705修正済み): 何回reset-requestを呼んでもresetTokenが漏洩することはない(単発攻撃・連打のいずれも無効)", async () => {
    // 修正前はメールアドレスを知るだけで1回のリクエストで攻撃が完結し、
    // 5req/min/IPのレート制限(worker-api自体には掛かっていない)は無力だった。
    // 修正後はそもそもトークンが発行されないため、リクエスト回数によらず
    // resetTokenが漏れることはない。
    const victim = await createTestUser();
    for (let i = 0; i < 3; i += 1) {
      const res = await callWorkerApi(
        new Request("http://worker-api.internal/internal/auth/reset-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: victim.email }),
        }),
      );
      const { resetToken } = (await res.json()) as { resetToken: string | null };
      expect(resetToken).toBeNull();
    }
  });
});
