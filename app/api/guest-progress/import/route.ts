import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { problemResponse } from "@/lib/auth/http";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  verifyCsrfToken,
} from "@/lib/api/csrf";
import { isKnownSlug } from "@/lib/progress/slugManifest";
import { isValidTimeZone } from "@/lib/progress/streak";
import { mergeGuestProgressEntry } from "@/lib/progress/guestProgress";
import { toProgressRecord } from "@/lib/progress/serialize";
import {
  PostGuestProgressImportRequestSchema,
  type GuestProgressEntry,
  type PostGuestProgressImportResponse,
  type ProgressRecord,
} from "@/lib/contracts";

/**
 * POST /api/guest-progress/import。T-113 / 02§3表#9 / 02§6「ゲスト進捗」。
 * localStorageの`guest-progress`配列(未ログイン中の進捗)を初回ログイン時に
 * サーバへ取り込み、既存行とdone優先マージ(lib/progress/guestProgress.ts)する。
 *
 * ストリーク(streaks)は更新しない: ゲスト期間中の複数日の活動をまとめて
 * インポートすると、実際には連続学習していなくても複数日分のストリークが
 * 生成されてしまうため(02§2.1 streaksは「その日に学習した」実活動の記録)。
 * clientTzはcontracts(lib/contracts/api.ts、変更禁止)が要求するフィールドの
 * ためリクエストには含めるが、本エンドポイントでは妥当性検証にのみ使う。
 */
export async function POST(request: NextRequest) {
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

  const parsed = PostGuestProgressImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  if (!isValidTimeZone(parsed.data.clientTz)) {
    return problemResponse(
      400,
      "about:blank#validation-error",
      "validation_error",
      `clientTz '${parsed.data.clientTz}' はIANAタイムゾーンとして無効です`,
    );
  }

  // slugマニフェストに存在しないエントリ(削除・リネーム済みslug等)は
  // 個別の409で全体を失敗させず、静かに除外する(一括インポートのため)。
  const validEntries = parsed.data.entries.filter((entry) =>
    isKnownSlug(entry.itemType, entry.itemSlug),
  );

  const merged: ProgressRecord[] = [];
  for (const entry of validEntries) {
    merged.push(await importOne(userId, entry));
  }

  const responseBody: PostGuestProgressImportResponse = {
    imported: merged.length,
    progress: merged,
  };
  return NextResponse.json(responseBody, { status: 200 });
}

async function importOne(userId: string, entry: GuestProgressEntry): Promise<ProgressRecord> {
  const { itemType, itemSlug } = entry;
  const existing = await prisma.progress.findUnique({
    where: { userId_itemType_itemSlug: { userId, itemType, itemSlug } },
  });

  const existingAsEntry: GuestProgressEntry | undefined = existing
    ? {
        itemType,
        itemSlug,
        status: existing.status as GuestProgressEntry["status"],
        score: existing.score ?? undefined,
      }
    : undefined;

  const mergedEntry = mergeGuestProgressEntry(existingAsEntry, entry);
  const score = mergedEntry.score ?? null;

  const row = await prisma.progress.upsert({
    where: { userId_itemType_itemSlug: { userId, itemType, itemSlug } },
    update: {
      status: mergedEntry.status,
      score,
      completedAt: mergedEntry.status === "done" ? (existing?.completedAt ?? new Date()) : null,
    },
    create: {
      userId,
      itemType,
      itemSlug,
      status: mergedEntry.status,
      score,
      completedAt: mergedEntry.status === "done" ? new Date() : null,
    },
  });

  return toProgressRecord(row);
}
