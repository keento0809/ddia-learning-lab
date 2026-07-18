import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

/**
 * T-004 受入基準: Prisma経由のCRUD統合テスト。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration` から実行する。
 */
describe("Prisma CRUD (db.crud.integration)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.userBadge.deleteMany();
    await prisma.streak.deleteMany();
    await prisma.note.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.progress.deleteMany();
    await prisma.oauthAccount.deleteMany();
    await prisma.badge.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates, reads, updates, and deletes a user", async () => {
    const created = await prisma.user.create({
      data: { email: "crud@example.com", displayName: "CRUD User" },
    });
    expect(created.id).toBeTruthy();
    expect(created.localePref).toBe("ja");

    const found = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(found.email).toBe("crud@example.com");

    const updated = await prisma.user.update({
      where: { id: created.id },
      data: { displayName: "Updated User" },
    });
    expect(updated.displayName).toBe("Updated User");

    await prisma.user.delete({ where: { id: created.id } });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: created.id } }),
    ).rejects.toThrow();
  });

  it("enforces UNIQUE(email) on users", async () => {
    await prisma.user.create({
      data: { email: "dup@example.com", displayName: "First" },
    });
    await expect(
      prisma.user.create({
        data: { email: "dup@example.com", displayName: "Second" },
      }),
    ).rejects.toThrow();
  });

  it("upserts progress and enforces UNIQUE(user_id, item_type, item_slug)", async () => {
    const user = await prisma.user.create({
      data: { email: "progress@example.com", displayName: "Progress User" },
    });

    const first = await prisma.progress.create({
      data: {
        userId: user.id,
        itemType: "lesson",
        itemSlug: "03-storage/01-hash-index",
        status: "in_progress",
      },
    });

    await expect(
      prisma.progress.create({
        data: {
          userId: user.id,
          itemType: "lesson",
          itemSlug: "03-storage/01-hash-index",
          status: "in_progress",
        },
      }),
    ).rejects.toThrow();

    const upserted = await prisma.progress.upsert({
      where: {
        userId_itemType_itemSlug: {
          userId: user.id,
          itemType: "lesson",
          itemSlug: "03-storage/01-hash-index",
        },
      },
      update: { status: "done", completedAt: new Date() },
      create: {
        userId: user.id,
        itemType: "lesson",
        itemSlug: "03-storage/01-hash-index",
        status: "done",
      },
    });
    expect(upserted.id).toBe(first.id);
    expect(upserted.status).toBe("done");
  });

  it("cascades oauth_accounts delete when the owning user is deleted", async () => {
    const user = await prisma.user.create({
      data: { email: "oauth@example.com", displayName: "OAuth User" },
    });
    const account = await prisma.oauthAccount.create({
      data: {
        userId: user.id,
        provider: "github",
        providerAccountId: randomUUID(),
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.oauthAccount.findUnique({
      where: { id: account.id },
    });
    expect(remaining).toBeNull();
  });

  it("enforces UNIQUE(provider, provider_account_id) on oauth_accounts", async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: { email: "oauth-a@example.com", displayName: "A" },
      }),
      prisma.user.create({
        data: { email: "oauth-b@example.com", displayName: "B" },
      }),
    ]);
    const providerAccountId = randomUUID();

    await prisma.oauthAccount.create({
      data: { userId: userA.id, provider: "google", providerAccountId },
    });

    await expect(
      prisma.oauthAccount.create({
        data: { userId: userB.id, provider: "google", providerAccountId },
      }),
    ).rejects.toThrow();
  });

  it("creates and reads a submission", async () => {
    const user = await prisma.user.create({
      data: { email: "submission@example.com", displayName: "Sub User" },
    });
    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        exerciseSlug: "06-partitioning/consistent-hash",
        language: "js",
        code: "console.log(1)",
        result: "pass",
        passedTests: 3,
        totalTests: 3,
        clientGraderVersion: "1.0.0",
      },
    });
    expect(submission.result).toBe("pass");

    const latest = await prisma.submission.findFirst({
      where: { userId: user.id, exerciseSlug: "06-partitioning/consistent-hash" },
      orderBy: { createdAt: "desc" },
    });
    expect(latest?.id).toBe(submission.id);
  });

  it("enforces UNIQUE(user_id, lesson_slug) on notes", async () => {
    const user = await prisma.user.create({
      data: { email: "note@example.com", displayName: "Note User" },
    });
    await prisma.note.create({
      data: {
        userId: user.id,
        lessonSlug: "03-storage/01-hash-index",
        bodyMd: "memo",
      },
    });
    await expect(
      prisma.note.create({
        data: {
          userId: user.id,
          lessonSlug: "03-storage/01-hash-index",
          bodyMd: "memo2",
        },
      }),
    ).rejects.toThrow();
  });

  it("creates a badge, grants it to a user, and manages a streak", async () => {
    const user = await prisma.user.create({
      data: { email: "badge@example.com", displayName: "Badge User" },
    });
    const badge = await prisma.badge.create({
      data: { slug: "first-lesson", criteria: { lessonsCompleted: 1 } },
    });
    const grant = await prisma.userBadge.create({
      data: { userId: user.id, badgeId: badge.id },
    });
    expect(grant.userId).toBe(user.id);

    const streak = await prisma.streak.create({
      data: { userId: user.id, currentDays: 1, longestDays: 1 },
    });
    expect(streak.currentDays).toBe(1);

    const updated = await prisma.streak.update({
      where: { userId: user.id },
      data: { currentDays: 2, longestDays: 2 },
    });
    expect(updated.currentDays).toBe(2);
  });
});
