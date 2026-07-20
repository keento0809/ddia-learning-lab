import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { problemResponse } from "@/lib/auth/http";
import { getCurriculumModules } from "@/lib/curriculum";
import { computeCurriculumProgress } from "@/lib/progress/moduleProgress";
import { countSlugsByType } from "@/lib/progress/slugManifest";
import type {
  Badge,
  DashboardResume,
  GetDashboardResponse,
  ProgressItemType,
  ProgressRecord,
  ProgressStatus,
} from "@/lib/contracts";

/**
 * GET /api/dashboard。03文書T-112 / 02§3.1「代表I/O定義」。
 */

interface ProgressRow {
  id: string;
  itemType: string;
  itemSlug: string;
  status: string;
  score: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

/** app/api/progress/route.tsのtoProgressRecordと同型(T-104既存パターンを踏襲) */
function toProgressRecord(row: ProgressRow): ProgressRecord {
  return {
    id: row.id,
    itemType: row.itemType as ProgressItemType,
    itemSlug: row.itemSlug,
    status: row.status as ProgressStatus,
    score: row.score,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return problemResponse(401, "about:blank#unauthorized", "unauthorized");
  }

  const [progressRowsRaw, streakRow, userBadgeRows] = await Promise.all([
    prisma.progress.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    prisma.streak.findUnique({ where: { userId } }),
    prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
  ]);
  const progressRows = progressRowsRaw.map(toProgressRecord);

  const lessonsDone = progressRows.filter(
    (row) => row.itemType === "lesson" && row.status === "done",
  ).length;
  const exercisesPassed = progressRows.filter(
    (row) => row.itemType === "exercise" && row.status === "done",
  ).length;

  // lib/curriculum.tsの生成データはタイトル以外(slug/lessonCount)がロケール間で
  // 同一(.claude/rules/i18n.md「ja/enはファイルパス=slugで1:1対応」)のため、
  // モジュール別進捗率(パーセントのみ、タイトル不使用)の算出にはロケールを問わない。
  const modules = computeCurriculumProgress(getCurriculumModules("ja"), progressRows);

  const resumeRow = progressRows.find((row) => row.status === "in_progress");
  // titleKeyはitemSlugそのもの。表示用タイトルへの解決はフロントエンド側の責務とする
  // (lib/moduleDetail.tsの生成済みJSONを通常のESM importで参照できるため、
  // サーバ側で新規のタイトル解決用データ生成物を追加する必要がない)。
  const resume: DashboardResume | null = resumeRow
    ? { itemType: resumeRow.itemType, itemSlug: resumeRow.itemSlug, titleKey: resumeRow.itemSlug }
    : null;

  const badges: Badge[] = userBadgeRows.map((row) => ({
    slug: row.badge.slug,
    grantedAt: row.grantedAt.toISOString(),
  }));

  const body: GetDashboardResponse = {
    overall: {
      lessonsDone,
      lessonsTotal: countSlugsByType("lesson"),
      exercisesPassed,
    },
    modules,
    resume,
    streak: {
      currentDays: streakRow?.currentDays ?? 0,
      longestDays: streakRow?.longestDays ?? 0,
    },
    badges,
  };

  return NextResponse.json(body, { status: 200 });
}
