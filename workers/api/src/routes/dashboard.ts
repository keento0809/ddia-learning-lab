import { Hono } from "hono";
import type { Context } from "hono";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
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
import type { Env } from "../env";

/**
 * GET /api/dashboard。worker-appから移設(ADR-008/T-502)。
 * ロジックは app/api/dashboard/route.ts(T-112)と同一(02§3.1)。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

interface ProgressRow {
  id: string;
  itemType: string;
  itemSlug: string;
  status: string;
  score: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

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

export const dashboardRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRoute.get("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const userId = c.get("userId");
  const prisma = c.get("prisma");

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

  const modules = computeCurriculumProgress(getCurriculumModules("ja"), progressRows);

  const resumeRow = progressRows.find((row) => row.status === "in_progress");
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

  return c.json(body, 200);
});
