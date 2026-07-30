import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

/**
 * T-308(設定画面 S-10)受入基準(5)「設定変更のAPI統合テスト(認証必須/
 * バリデーション)」+ (4)「削除済みユーザーでログイン不可となるテスト」。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration`から
 * 実行する(progress.flow.integration.test.tsと同じ方針: auth()をモックし、
 * dispatchToWorkerApi経由でworker-api本体(実Prisma・実JWT検証)を通す)。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth/config");
const { GET, PATCH, DELETE } = await import("@/app/api/account/route");
const { verifyCredentialsViaWorkerApi } = await import("@/lib/auth/workerApiAuth");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

const BASE_URL = "http://localhost:3000/api/account";

function extractCookiePairs(response: Response): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    pairs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return pairs;
}

function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function fetchCsrfCookie(): Promise<Record<string, string>> {
  const response = await GET(new NextRequest(BASE_URL));
  return extractCookiePairs(response);
}

async function patchAccount(cookies: Record<string, string>, body: unknown, csrfToken?: string) {
  return PATCH(
    new NextRequest(BASE_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: toCookieHeader(cookies),
        ...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function deleteAccount(cookies: Record<string, string>, body: unknown, csrfToken?: string) {
  return DELETE(
    new NextRequest(BASE_URL, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        cookie: toCookieHeader(cookies),
        ...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET/PATCH/DELETE /api/account (T-308)", () => {
  let userId: string;
  let email: string;
  const PASSWORD = "correct horse battery staple";

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    email = `settings-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: "Settings Test User" },
    });
    userId = user.id;
    mockedAuth.mockResolvedValue({
      user: { id: userId },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("401: 未認証のGETはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await GET(new NextRequest(BASE_URL));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("401: 未認証のPATCHはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await patchAccount({}, { displayName: "x" });
    expect(response.status).toBe(401);
  });

  it("401: 未認証のDELETEはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await deleteAccount({}, { confirmationEmail: email });
    expect(response.status).toBe(401);
  });

  it("正常: GETは02§2.1のusers列(display_name/locale_pref/theme_pref)を返す", async () => {
    const response = await GET(new NextRequest(BASE_URL));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      account: { id: string; email: string; displayName: string; localePref: string; themePref: string };
    };
    expect(body.account).toEqual({
      id: userId,
      email,
      displayName: "Settings Test User",
      localePref: "ja",
      themePref: "system",
    });
  });

  it("400: PATCHで1フィールドも指定しない場合はvalidation_errorを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await patchAccount(cookies, {}, cookies["csrf-token"]);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });

  it("400: PATCHで不正なlocalePrefはvalidation_errorを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await patchAccount(cookies, { localePref: "fr" }, cookies["csrf-token"]);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });

  it("403: PATCHでCSRFヘッダ欠落/不一致はcsrf_token_invalidを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await patchAccount(cookies, { displayName: "New Name" });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("csrf_token_invalid");
  });

  it("正常: PATCHでdisplay_name/locale_pref/theme_prefを更新できる", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await patchAccount(
      cookies,
      { displayName: "New Name", localePref: "en", themePref: "dark" },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      account: { displayName: string; localePref: string; themePref: string };
    };
    expect(body.account.displayName).toBe("New Name");
    expect(body.account.localePref).toBe("en");
    expect(body.account.themePref).toBe("dark");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.displayName).toBe("New Name");
    expect(row.localePref).toBe("en");
    expect(row.themePref).toBe("dark");
  });

  it("400: DELETEでconfirmationEmailがアカウントのメールアドレスと一致しない場合は削除されない", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await deleteAccount(cookies, { confirmationEmail: "wrong@example.com" }, cookies["csrf-token"]);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("validation_error");

    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row).not.toBeNull();
  });

  it("403: DELETEでCSRFヘッダ欠落/不一致はcsrf_token_invalidを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await deleteAccount(cookies, { confirmationEmail: email });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("csrf_token_invalid");
  });

  it(
    "正常: DELETEで論理削除→物理削除まで行われ、以後の同一セッションでのリクエストは401、" +
      "削除済みメールアドレスでのログインも失敗する(受入基準(3)(4))",
    async () => {
      // 関連テーブル(progress/submissions/notes/user_badges/streaks)に行を作り、
      // アカウント削除で物理削除まで行われることを確認する。
      await prisma.progress.create({
        data: { userId, itemType: "lesson", itemSlug: "01-reliability/01-load-and-performance", status: "done" },
      });
      await prisma.streak.create({ data: { userId, currentDays: 1, longestDays: 1, lastActiveDate: new Date() } });

      const cookies = await fetchCsrfCookie();
      const response = await deleteAccount(cookies, { confirmationEmail: email }, cookies["csrf-token"]);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("ok");

      const userRow = await prisma.user.findUnique({ where: { id: userId } });
      expect(userRow).toBeNull();
      const progressRows = await prisma.progress.findMany({ where: { userId } });
      expect(progressRows).toEqual([]);
      const streakRow = await prisma.streak.findUnique({ where: { userId } });
      expect(streakRow).toBeNull();

      // (3) セッション無効化: 同じuserIdのJWTセッションでも以後は401になる。
      const afterDeleteResponse = await GET(new NextRequest(BASE_URL, { headers: { cookie: toCookieHeader(cookies) } }));
      expect(afterDeleteResponse.status).toBe(401);

      // (4) 削除済みユーザーでログイン不可。
      const loginResult = await verifyCredentialsViaWorkerApi(email, PASSWORD);
      expect(loginResult).toBeNull();
    },
  );
});
