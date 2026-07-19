import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { problemResponse } from "@/lib/auth/http";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  verifyCsrfToken,
} from "@/lib/api/csrf";
import { isKnownSlug, slugsForModule } from "@/lib/progress/slugManifest";
import { advanceStreak, isValidTimeZone, todayInTimeZone } from "@/lib/progress/streak";
import { toProgressRecord } from "@/lib/progress/serialize";
import {
  GetProgressQuerySchema,
  PutProgressRequestSchema,
  type GetProgressResponse,
  type PutProgressResponse,
} from "@/lib/contracts";

/**
 * PUT/GET /api/progress。03文書T-104 / 02§3.1「代表I/O定義」。
 */

/** dbのDate列(@db.Date)をYYYY-MM-DD文字列へ(UTC正午格納との往復)*/
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFromIsoDate(isoDateStr: string): Date {
  return new Date(`${isoDateStr}T00:00:00.000Z`);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return problemResponse(401, "about:blank#unauthorized", "unauthorized");
  }

  const query = GetProgressQuerySchema.safeParse({
    module: request.nextUrl.searchParams.get("module") ?? undefined,
  });
  if (!query.success) {
    return problemResponse(
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
  const response = NextResponse.json(body, { status: 200 });

  // ダブルサブミットCSRF用cookie未発行なら、この安全メソッド応答で発行する
  // (02§4.3「ログイン時はGET /api/progressを1回取得」= 状態変更系より必ず先行する)。
  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return response;
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return problemResponse(401, "about:blank#unauthorized", "unauthorized");
  }

  if (!verifyCsrfToken(request)) {
    return problemResponse(
      403,
      "about:blank#csrf-token-invalid",
      "csrf_token_invalid",
      `cookie '${CSRF_COOKIE_NAME}' とヘッダ '${CSRF_HEADER_NAME}' が一致しません`,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  const parsed = PutProgressRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const { itemType, itemSlug, status, score, clientTz } = parsed.data;

  if (!isKnownSlug(itemType, itemSlug)) {
    return problemResponse(409, "about:blank#slug-unknown", "slug_unknown");
  }

  if (!isValidTimeZone(clientTz)) {
    return problemResponse(
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
  // 後退リクエストは進捗行に対しては完全な無操作とする(observableな状態変化なし)。
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

  // ストリークは「その日に学習した」活動そのものを表すため、statusの単調性とは
  // 独立に、有効なPUTリクエストであれば(後退で無視された場合も含め)毎回進める。
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
    // バッジ付与条件の評価はT-303のスコープ(STATUS.md T-104行 依存元)。
    // 本タスクはPutProgressResponseSchemaが要求するフィールドを空配列で満たすのみ。
    newBadges: [],
  };
  return NextResponse.json(responseBody, { status: 200 });
}
