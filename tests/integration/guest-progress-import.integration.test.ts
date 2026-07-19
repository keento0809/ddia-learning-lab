import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/db";

/**
 * T-113受入基準「マージロジックのテーブル駆動テスト(両方done/片方のみ/競合)」の
 * ルートレベル検証(DBまで通す)。純粋関数レベルの網羅は
 * tests/unit/progress/guestProgress.test.tsで行い、ここでは実際にPOST
 * /api/guest-progress/importを叩いて既存DB行とのマージ・upsertが正しく
 * 行われることを確認する(T-104のtests/integration/progress.flow.integration.test.ts
 * と同じパターン、`npm run test:integration`が必要)。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth/config");
const { GET } = await import("@/app/api/progress/route");
const { POST } = await import("@/app/api/guest-progress/import/route");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

const PROGRESS_URL = "http://localhost:3000/api/progress";
const IMPORT_URL = "http://localhost:3000/api/guest-progress/import";

const KNOWN_LESSON = { itemType: "lesson" as const, itemSlug: "01-reliability/01-load-and-performance" };
const KNOWN_EXERCISE = { itemType: "exercise" as const, itemSlug: "01-reliability/percentile-lab" };

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
  const response = await GET(new NextRequest(PROGRESS_URL));
  return extractCookiePairs(response);
}

async function importGuestProgress(
  cookies: Record<string, string>,
  body: unknown,
  csrfToken?: string,
) {
  return POST(
    new NextRequest(IMPORT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: toCookieHeader(cookies),
        ...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/guest-progress/import (T-113)", () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await prisma.user.create({
      data: { email: `guest-import-${randomUUID()}@example.com`, displayName: "Guest Import Test User" },
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

  it("401: 未認証はunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await POST(
      new NextRequest(IMPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [], clientTz: "UTC" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(((await response.json()) as { title: string }).title).toBe("unauthorized");
  });

  it("403: CSRFヘッダ欠落はcsrf_token_invalidを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await importGuestProgress(cookies, { entries: [], clientTz: "UTC" });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { title: string }).title).toBe("csrf_token_invalid");
  });

  it("400: 不正なclientTzはvalidation_errorを返す", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await importGuestProgress(
      cookies,
      { entries: [], clientTz: "Not/AZone" },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { title: string }).title).toBe("validation_error");
  });

  it("未知slugのエントリは静かに除外され、importedは既知分のみをカウントする", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await importGuestProgress(
      cookies,
      {
        entries: [
          { ...KNOWN_LESSON, status: "done" },
          { itemType: "lesson", itemSlug: "99-unknown/does-not-exist", status: "done" },
        ],
        clientTz: "UTC",
      },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { imported: number; progress: { itemSlug: string }[] };
    expect(body.imported).toBe(1);
    expect(body.progress.map((p) => p.itemSlug)).toEqual([KNOWN_LESSON.itemSlug]);
  });

  it("新規行の作成(既存なし): 取り込みそのままupsertされる", async () => {
    const cookies = await fetchCsrfCookie();
    const response = await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_LESSON, status: "in_progress" }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { progress: { status: string; itemSlug: string }[] };
    expect(body.progress[0]).toMatchObject({ itemSlug: KNOWN_LESSON.itemSlug, status: "in_progress" });
  });

  it("両方done: 既存doneのscoreと取り込みdoneのscoreのうち高い方が残る", async () => {
    const cookies = await fetchCsrfCookie();
    await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_EXERCISE, status: "done", score: 70 }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const response = await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_EXERCISE, status: "done", score: 90 }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const body = (await response.json()) as { progress: { status: string; score: number | null }[] };
    expect(body.progress[0]).toMatchObject({ status: "done", score: 90 });
  });

  it("片方のみdone: 既存in_progress + 取り込みdoneはdoneへ昇格する", async () => {
    const cookies = await fetchCsrfCookie();
    await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_LESSON, status: "in_progress" }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const response = await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_LESSON, status: "done" }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const body = (await response.json()) as { progress: { status: string; completedAt: string | null }[] };
    expect(body.progress[0].status).toBe("done");
    expect(body.progress[0].completedAt).toBeTruthy();
  });

  it("競合(両方in_progress、score不一致): statusはin_progressのまま、scoreは高い方", async () => {
    const cookies = await fetchCsrfCookie();
    await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_EXERCISE, status: "in_progress", score: 40 }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const response = await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_EXERCISE, status: "in_progress", score: 60 }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const body = (await response.json()) as { progress: { status: string; score: number | null }[] };
    expect(body.progress[0]).toMatchObject({ status: "in_progress", score: 60 });
  });

  it("インポートはstreak行を作成・変更しない", async () => {
    const cookies = await fetchCsrfCookie();
    await importGuestProgress(
      cookies,
      { entries: [{ ...KNOWN_LESSON, status: "done" }], clientTz: "UTC" },
      cookies["csrf-token"],
    );
    const streak = await prisma.streak.findUnique({ where: { userId } });
    expect(streak).toBeNull();
  });
});
