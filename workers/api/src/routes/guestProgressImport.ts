import { Hono } from "hono";
import type { Context } from "hono";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
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
import type { Env } from "../env";
import { verifyCsrfToken, CSRF_COOKIE_NAME } from "../csrf";
import { problemResponse } from "../problem";

/**
 * POST /api/guest-progress/import。worker-appから移設(ADR-008/T-502)。
 * ロジックは app/api/guest-progress/import/route.ts(T-113)と同一(02§6)。
 * ストリークは更新しない(元実装のコメント参照)。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

export const guestProgressImportRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

guestProgressImportRoute.post(
  "/",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
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

    const parsed = PostGuestProgressImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(
        c,
        400,
        "about:blank#validation-error",
        "validation_error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }

    if (!isValidTimeZone(parsed.data.clientTz)) {
      return problemResponse(
        c,
        400,
        "about:blank#validation-error",
        "validation_error",
        `clientTz '${parsed.data.clientTz}' はIANAタイムゾーンとして無効です`,
      );
    }

    const validEntries = parsed.data.entries.filter((entry) =>
      isKnownSlug(entry.itemType, entry.itemSlug),
    );

    const merged: ProgressRecord[] = [];
    for (const entry of validEntries) {
      merged.push(await importOne(prisma, userId, entry));
    }

    const responseBody: PostGuestProgressImportResponse = {
      imported: merged.length,
      progress: merged,
    };
    return c.json(responseBody, 200);
  },
);

async function importOne(
  prisma: PrismaClient,
  userId: string,
  entry: GuestProgressEntry,
): Promise<ProgressRecord> {
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
