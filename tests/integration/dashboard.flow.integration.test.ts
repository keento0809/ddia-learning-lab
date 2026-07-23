import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { GetDashboardResponse } from "@/lib/contracts";
import { issueSessionCookie } from "./helpers/sessionCookie";

/**
 * 03文書T-112受入基準「API統合テスト」。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration`から実行する
 * (`pretest:integration`がtests/fixtures/content/validを対象にslugマニフェストを再生成する。
 * 既知slugはtests/integration/progress.flow.integration.test.tsと同一のフィクスチャに基づく:
 * モジュール"01-reliability"、レッスン2件・quiz1件・演習1件)。
 *
 * ADR-008(docs/design/09) §2・T-502: GET /api/dashboardの実装は
 * workers/api/src/routes/dashboard.ts(Hono)へ移設され、app/api/dashboard/route.ts
 * はservice binding経由の薄いフォワーダ(lib/api/workerApiDispatch.ts)になった。
 * worker-apiはNext.jsのauth()を経由せずCookie内JWTを自己完結で検証するため、
 * このテストはauth()のモックではなく、実際に署名したセッションJWT Cookieを
 * リクエストに付与する。dispatchToWorkerApiは実際のCloudflare service binding
 * (env.API.fetch)の代わりに、worker-apiの本体(workers/api/src/index.tsの
 * Honoアプリ)をインプロセスで直接呼び出すようモックする(ビジネスロジック
 * ・JWT検証・Prismaは実物のまま、Cloudflareのデプロイ環境依存部分のみを
 * 差し替える)。
 */
vi.mock("@/lib/api/workerApiDispatch", async () => {
  const { default: app } = await import("@/workers/api/src/index");
  return {
    dispatchToWorkerApi: (request: Request) =>
      app.fetch(request, {
        AUTH_SECRET: process.env.AUTH_SECRET!,
        DATABASE_URL: process.env.DATABASE_URL!,
      }),
  };
});

const { GET } = await import("@/app/api/dashboard/route");

const BASE_URL = "http://localhost:3000/api/dashboard";
const KNOWN_LESSON_1 = "01-reliability/01-load-and-performance";
const KNOWN_LESSON_2 = "01-reliability/02-percentiles";
const KNOWN_QUIZ = "01-reliability/quiz";
const KNOWN_EXERCISE = "01-reliability/percentile-lab";

async function getDashboard(cookie: string): Promise<{ status: number; body: GetDashboardResponse }> {
  const response = await GET(new NextRequest(BASE_URL, { headers: { cookie } }));
  const body = (await response.json()) as GetDashboardResponse;
  return { status: response.status, body };
}

describe("GET /api/dashboard (T-112)", () => {
  let userId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: `dashboard-${randomUUID()}@example.com`, displayName: "Dashboard Test User" },
    });
    userId = user.id;
    sessionCookie = await issueSessionCookie(userId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("401: 未認証はunauthorizedを返す", async () => {
    const response = await GET(new NextRequest(BASE_URL));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("進捗が無いユーザーは全項目ゼロ値・resume null・badges空配列を返す", async () => {
    const { status, body } = await getDashboard(sessionCookie);
    expect(status).toBe(200);
    expect(body.overall).toEqual({ lessonsDone: 0, lessonsTotal: 2, exercisesPassed: 0 });
    expect(body.modules).toEqual(
      expect.arrayContaining([{ slug: "01-reliability", percent: 0 }]),
    );
    expect(body.resume).toBeNull();
    expect(body.streak).toEqual({ currentDays: 0, longestDays: 0 });
    expect(body.badges).toEqual([]);
  });

  it("正常: 進捗/ストリークからoverall・modules・resume・streakを集計する", async () => {
    await prisma.progress.create({
      data: {
        userId,
        itemType: "lesson",
        itemSlug: KNOWN_LESSON_1,
        status: "done",
        completedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    });
    await prisma.progress.create({
      data: {
        userId,
        itemType: "lesson",
        itemSlug: KNOWN_LESSON_2,
        status: "in_progress",
        updatedAt: new Date("2026-07-20T00:00:00.000Z"),
      },
    });
    await prisma.progress.create({
      data: {
        userId,
        itemType: "quiz",
        itemSlug: KNOWN_QUIZ,
        status: "done",
        score: 80,
        completedAt: new Date("2026-07-18T00:00:00.000Z"),
      },
    });
    await prisma.progress.create({
      data: {
        userId,
        itemType: "exercise",
        itemSlug: KNOWN_EXERCISE,
        status: "done",
        score: 100,
        completedAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    });
    await prisma.streak.create({
      data: { userId, currentDays: 4, longestDays: 11, lastActiveDate: new Date("2026-07-20T00:00:00.000Z") },
    });

    const { status, body } = await getDashboard(sessionCookie);
    expect(status).toBe(200);

    // lessonsTotal=2はフィクスチャ(01-reliability配下の2レッスン)由来の
    // slugマニフェスト全体件数。lessonsDone=1(KNOWN_LESSON_1のみdone)。
    expect(body.overall).toEqual({ lessonsDone: 1, lessonsTotal: 2, exercisesPassed: 1 });
    expect(body.modules).toEqual(
      expect.arrayContaining([{ slug: "01-reliability", percent: 50 }]),
    );

    // resumeは唯一のin_progress行(KNOWN_LESSON_2)
    expect(body.resume).toEqual({
      itemType: "lesson",
      itemSlug: KNOWN_LESSON_2,
      titleKey: KNOWN_LESSON_2,
    });

    expect(body.streak).toEqual({ currentDays: 4, longestDays: 11 });
    expect(body.badges).toEqual([]);
  });

  it("バッジ: user_badgesに存在する行はslug/grantedAtとして返す", async () => {
    const badge = await prisma.badge.create({
      data: { slug: "part1-complete", criteria: {} },
    });
    await prisma.userBadge.create({
      data: { userId, badgeId: badge.id, grantedAt: new Date("2026-07-15T00:00:00.000Z") },
    });

    const { body } = await getDashboard(sessionCookie);
    expect(body.badges).toEqual([
      { slug: "part1-complete", grantedAt: "2026-07-15T00:00:00.000Z" },
    ]);
  });
});
