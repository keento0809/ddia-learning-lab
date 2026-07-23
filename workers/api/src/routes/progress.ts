import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import { isKnownSlug, slugsForModule } from "@/lib/progress/slugManifest";
import { advanceStreak, isValidTimeZone, todayInTimeZone } from "@/lib/progress/streak";
import { toProgressRecord } from "@/lib/progress/serialize";
import {
  GetProgressQuerySchema,
  PutProgressRequestSchema,
  type GetProgressResponse,
  type PutProgressResponse,
} from "@/lib/contracts";
import type { Env } from "../env";
import { CSRF_COOKIE_NAME, generateCsrfToken, verifyCsrfToken } from "../csrf";
import { problemResponse } from "../problem";

/**
 * PUT/GET /api/progress。worker-appから移設(ADR-008/T-502)。
 * ロジックは app/api/progress/route.ts(T-104)と同一(02§3.1)。
 * userIdはworker-api側のJWT検証ミドルウェア(requireSession、../index.ts)が
 * c.set("userId", ...)で設定済みのものを使う。prismaも同様にリクエストごとの
 * インスタンス(../index.tsのミドルウェア、../db.tsのコメント参照)を使う。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

/** dbのDate列(@db.Date)をYYYY-MM-DD文字列へ(UTC正午格納との往復)*/
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFromIsoDate(isoDateStr: string): Date {
  return new Date(`${isoDateStr}T00:00:00.000Z`);
}

export const progressRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

progressRoute.get("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const userId = c.get("userId");
  const prisma = c.get("prisma");

  const query = GetProgressQuerySchema.safeParse({
    module: c.req.query("module") ?? undefined,
  });
  if (!query.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      query.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const rows = await prisma.progress.findMany({
    where: query.data.module
      ? { userId, itemSlug: { in: slugsForModule(query.data.module) } }
      : { userId },
    orderBy: { updatedAt: "desc" },
  });

  const body: GetProgressResponse = { progress: rows.map(toProgressRecord) };

  // ダブルサブミットCSRF用cookie未発行なら、この安全メソッド応答で発行する
  // (02§4.3「ログイン時はGET /api/progressを1回取得」= 状態変更系より必ず先行する)。
  if (!getCookie(c, CSRF_COOKIE_NAME)) {
    setCookie(c, CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      sameSite: "Lax",
      // Workersにprocess.env.NODE_ENVの概念はないため、Next.js側
      // (lib/api/csrf.ts利用箇所)と同じ判定意図をリクエストプロトコルで表す。
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
    });
  }
  return c.json(body, 200);
});

progressRoute.put("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const userId = c.get("userId");
  const prisma = c.get("prisma");

  if (!verifyCsrfToken(c)) {
    return problemResponse(
      c,
      403,
      "about:blank#csrf-token-invalid",
      "csrf_token_invalid",
      `cookie '${CSRF_COOKIE_NAME}' とヘッダの値が一致しません`,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
  }

  const parsed = PutProgressRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const { itemType, itemSlug, status, score, clientTz } = parsed.data;

  if (!isKnownSlug(itemType, itemSlug)) {
    return problemResponse(c, 409, "about:blank#slug-unknown", "slug_unknown");
  }

  if (!isValidTimeZone(clientTz)) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      `clientTz '${clientTz}' はIANAタイムゾーンとして無効です`,
    );
  }
  const today = todayInTimeZone(clientTz);

  const [existingProgress, existingStreak] = await Promise.all([
    prisma.progress.findUnique({
      where: { userId_itemType_itemSlug: { userId, itemType, itemSlug } },
    }),
    prisma.streak.findUnique({ where: { userId } }),
  ]);

  // 02§3.1「statusの後退(done→in_progress)は無視(冪等・単調)」。
  const isMonotonicRegression = existingProgress?.status === "done" && status === "in_progress";

  const progressRow = isMonotonicRegression
    ? existingProgress!
    : await prisma.progress.upsert({
        where: { userId_itemType_itemSlug: { userId, itemType, itemSlug } },
        update: {
          status,
          score: score ?? existingProgress?.score ?? null,
          completedAt: status === "done" ? (existingProgress?.completedAt ?? new Date()) : null,
        },
        create: {
          userId,
          itemType,
          itemSlug,
          status,
          score: score ?? null,
          completedAt: status === "done" ? new Date() : null,
        },
      });

  const nextStreak = advanceStreak(
    {
      currentDays: existingStreak?.currentDays ?? 0,
      longestDays: existingStreak?.longestDays ?? 0,
      lastActiveDate: existingStreak?.lastActiveDate ? isoDate(existingStreak.lastActiveDate) : null,
    },
    today,
  );
  const streakRow = await prisma.streak.upsert({
    where: { userId },
    update: {
      currentDays: nextStreak.currentDays,
      longestDays: nextStreak.longestDays,
      lastActiveDate: dateFromIsoDate(nextStreak.lastActiveDate!),
    },
    create: {
      userId,
      currentDays: nextStreak.currentDays,
      longestDays: nextStreak.longestDays,
      lastActiveDate: dateFromIsoDate(nextStreak.lastActiveDate!),
    },
  });

  const responseBody: PutProgressResponse = {
    progress: toProgressRecord(progressRow),
    streak: { currentDays: streakRow.currentDays, longestDays: streakRow.longestDays },
    // バッジ付与条件の評価はT-303のスコープ(app/api/progress/route.tsの既存踏襲)。
    newBadges: [],
  };
  return c.json(responseBody, 200);
});
