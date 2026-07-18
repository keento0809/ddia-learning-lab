import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/db";

/**
 * 03文書T-104 受入基準「API統合テストで02§3.1の仕様表を1ケース=1テストで網羅
 * (正常/400/401/409/単調性/ストリーク日跨ぎ)」。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration`から実行する
 * (`pretest:integration`がtests/fixtures/content/validを対象にslugマニフェストを再生成する)。
 *
 * セッション解決(lib/auth/config.tsのauth())はT-005で既に検証済みのため、
 * ここではモックして固定ユーザーのセッションとして扱い、進捗API自体のロジック
 * (slugマニフェスト照合/単調性/ストリーク/CSRF)に焦点を当てる。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth/config");
const { GET, PUT } = await import("@/app/api/progress/route");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

const BASE_URL = "http://localhost:3000/api/progress";

const KNOWN_LESSON: { itemType: "lesson"; itemSlug: string } = {
  itemType: "lesson",
  itemSlug: "01-reliability/01-load-and-performance",
};
const KNOWN_QUIZ: { itemType: "quiz"; itemSlug: string } = {
  itemType: "quiz",
  itemSlug: "01-reliability/quiz",
};

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

/** GET /api/progress を1回叩き、CSRF cookieを取得する(02§4.3の実利用フローと同順) */
async function fetchCsrfCookie(): Promise<Record<string, string>> {
  const response = await GET(new NextRequest(BASE_URL));
  return extractCookiePairs(response);
}

async function putProgress(
  cookies: Record<string, string>,
  body: unknown,
  csrfToken?: string,
) {
  return PUT(
    new NextRequest(BASE_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: toCookieHeader(cookies),
        ...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function daysBeforeUtcToday(days: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcToday - days * 86_400_000).toISOString().slice(0, 10);
}

describe("PUT/GET /api/progress (T-104)", () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await prisma.user.create({
      data: { email: `progress-${randomUUID()}@example.com`, displayName: "Progress Test User" },
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

  it("401: 未認証のPUTはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await PUT(
      new NextRequest(BASE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...KNOWN_LESSON, status: "in_progress", clientTz: "UTC" }),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("400: バリデーションエラー(不正なstatus)はvalidation_errorを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await putProgress(
      cookies,
      { ...KNOWN_LESSON, status: "bogus", clientTz: "UTC" },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });

  it("403: CSRFヘッダ欠落/不一致はcsrf_token_invalidを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await putProgress(cookies, {
      ...KNOWN_LESSON,
      status: "in_progress",
      clientTz: "UTC",
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("csrf_token_invalid");
  });

  it("409: slugマニフェストに存在しないitemSlugはslug_unknownを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await putProgress(
      cookies,
      { itemType: "lesson", itemSlug: "99-unknown/does-not-exist", status: "in_progress", clientTz: "UTC" },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("slug_unknown");
  });

  it("正常: PUTでUPSERTしGETで取得できる(streak初日はcurrentDays=1)", async () => {
    const cookies = await fetchCsrfCookie();
    const putResponse = await putProgress(
      cookies,
      { ...KNOWN_LESSON, status: "in_progress", clientTz: "UTC" },
      cookies["csrf-token"],
    );
    expect(putResponse.status).toBe(200);
    const putBody = (await putResponse.json()) as {
      progress: { status: string; itemSlug: string };
      streak: { currentDays: number };
      newBadges: unknown[];
    };
    expect(putBody.progress.status).toBe("in_progress");
    expect(putBody.progress.itemSlug).toBe(KNOWN_LESSON.itemSlug);
    expect(putBody.streak.currentDays).toBe(1);
    expect(putBody.newBadges).toEqual([]);

    const getResponse = await GET(
      new NextRequest(BASE_URL, { headers: { cookie: toCookieHeader(cookies) } }),
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { progress: { itemSlug: string }[] };
    expect(getBody.progress.map((p) => p.itemSlug)).toContain(KNOWN_LESSON.itemSlug);
  });

  it("GET ?module=: 指定モジュールに属するslugのみ返す", async () => {
    const cookies = await fetchCsrfCookie();
    await putProgress(
      cookies,
      { ...KNOWN_QUIZ, status: "done", score: 80, clientTz: "UTC" },
      cookies["csrf-token"],
    );

    const matching = await GET(
      new NextRequest(`${BASE_URL}?module=01-reliability`, {
        headers: { cookie: toCookieHeader(cookies) },
      }),
    );
    const matchingBody = (await matching.json()) as { progress: { itemSlug: string }[] };
    expect(matchingBody.progress.map((p) => p.itemSlug)).toContain(KNOWN_QUIZ.itemSlug);

    const nonMatching = await GET(
      new NextRequest(`${BASE_URL}?module=02-does-not-exist`, {
        headers: { cookie: toCookieHeader(cookies) },
      }),
    );
    const nonMatchingBody = (await nonMatching.json()) as { progress: unknown[] };
    expect(nonMatchingBody.progress).toEqual([]);
  });

  it("単調性: done後のin_progressは無視され、進捗行は無変更のまま維持される", async () => {
    const cookies = await fetchCsrfCookie();
    const csrfToken = cookies["csrf-token"];

    const doneResponse = await putProgress(
      cookies,
      { ...KNOWN_LESSON, status: "done", clientTz: "UTC" },
      csrfToken,
    );
    const doneBody = (await doneResponse.json()) as {
      progress: { status: string; updatedAt: string; completedAt: string | null };
    };
    expect(doneBody.progress.status).toBe("done");
    expect(doneBody.progress.completedAt).toBeTruthy();

    const regressResponse = await putProgress(
      cookies,
      { ...KNOWN_LESSON, status: "in_progress", clientTz: "UTC" },
      csrfToken,
    );
    expect(regressResponse.status).toBe(200);
    const regressBody = (await regressResponse.json()) as {
      progress: { status: string; updatedAt: string; completedAt: string | null };
    };
    // 後退は無視される: statusは"done"のまま、進捗行は無操作(updatedAt/completedAt不変)
    expect(regressBody.progress.status).toBe("done");
    expect(regressBody.progress.updatedAt).toBe(doneBody.progress.updatedAt);
    expect(regressBody.progress.completedAt).toBe(doneBody.progress.completedAt);
  });

  it("ストリーク日跨ぎ: 前日から連続でcurrentDays+1、空白後は1にリセット", async () => {
    await prisma.streak.create({
      data: {
        userId,
        currentDays: 5,
        longestDays: 5,
        lastActiveDate: new Date(`${daysBeforeUtcToday(1)}T00:00:00.000Z`),
      },
    });

    const cookies = await fetchCsrfCookie();
    const consecutiveResponse = await putProgress(
      cookies,
      { ...KNOWN_LESSON, status: "in_progress", clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const consecutiveBody = (await consecutiveResponse.json()) as {
      streak: { currentDays: number; longestDays?: number };
    };
    expect(consecutiveBody.streak.currentDays).toBe(6);
    expect(consecutiveBody.streak.longestDays).toBe(6);

    // 3日以上の空白を挟んだ場合はリセットされる
    await prisma.streak.update({
      where: { userId },
      data: { lastActiveDate: new Date(`${daysBeforeUtcToday(4)}T00:00:00.000Z`) },
    });
    const resetResponse = await putProgress(
      cookies,
      { ...KNOWN_QUIZ, status: "in_progress", clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const resetBody = (await resetResponse.json()) as { streak: { currentDays: number } };
    expect(resetBody.streak.currentDays).toBe(1);
  });
});
