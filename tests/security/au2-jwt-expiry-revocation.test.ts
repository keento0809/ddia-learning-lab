import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { callWorkerApi, createTestUser, sessionCookieFor } from "./helpers/workerApi";

/**
 * T-703 AU-2(docs/design/11_ADR-011 §3.2)。JWTの有効期限・失効。
 *
 * セッションはJWT戦略(DBセッションテーブルなし、lib/auth/config.ts)のため、
 * 「サーバ側でトークンを無効化する」手段は本来存在しない。この実装は
 * requireSession(workers/api/src/index.ts)が毎リクエストDBを再照会し、
 * 対象ユーザーが存在しない/deletedAt設定済みなら即401にすることで
 * 「削除済みユーザーのセッション無効化」だけを実現している(退会時のみの
 * 実効的な失効機構)。
 */
describe("AU-2: JWTの有効期限・失効", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("有効なユーザーのセッションCookieでGET /internal/sessionが200を返す", async () => {
    const user = await createTestUser();
    const cookie = await sessionCookieFor(user.id);
    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/session", { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(user.id);
  });

  it("存在しないユーザーIDのセッションCookie(署名は正規)は401になる", async () => {
    const cookie = await sessionCookieFor(randomUUID());
    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/session", { headers: { cookie } }),
    );
    expect(res.status).toBe(401);
  });

  it("削除済み(論理削除)ユーザーのセッションCookieは、トークン自体の有効期限に関わらず即401になる", async () => {
    const user = await createTestUser();
    const cookie = await sessionCookieFor(user.id);

    // 発行済みトークンはまだ有効なまま、DB側だけ論理削除する(=退会操作の再現)。
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/session", { headers: { cookie } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it(
    "情報: 『ログアウト』はサーバ側のトークン無効化を伴わない設計であり、削除されていない" +
      "ユーザーの有効なセッションCookieは、キャプチャされていれば有効期限(既定30日)まで再利用され続ける" +
      "(lib/auth/config.tsに明示的なmaxAge指定なし=Auth.js既定値。ステートレスJWT採用のトレードオフとして" +
      "lib/db.ts/workers/api/src/index.tsのコメントに明記済みであり、本テストは仕様どおりの挙動を確認するのみ)",
    async () => {
      const user = await createTestUser();
      const cookie = await sessionCookieFor(user.id);

      const before = await callWorkerApi(
        new Request("http://worker-api.internal/internal/session", { headers: { cookie } }),
      );
      expect(before.status).toBe(200);

      // 「ログアウト」操作自体はクライアント側でCookieを破棄するだけで、サーバ側は
      // 何も状態変更しない(Auth.js JWT戦略にサーバ側revocationリストは存在しない)。
      // そのため同じCookie値は(ユーザーが削除されない限り)引き続き有効である。
      const after = await callWorkerApi(
        new Request("http://worker-api.internal/internal/session", { headers: { cookie } }),
      );
      expect(after.status).toBe(200);
    },
  );
});
