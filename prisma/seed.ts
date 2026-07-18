import { prisma } from "@/lib/db";

/**
 * 開発用seed。03_実装タスク分割書.md T-004: ユーザー2名+進捗数件。
 * 本番投入は想定しない(実行は `npm run db:seed`)。
 */
async function main() {
  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      email: "alice@example.com",
      displayName: "Alice",
      localePref: "ja",
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      email: "bob@example.com",
      displayName: "Bob",
      localePref: "en",
    },
  });

  await prisma.progress.upsert({
    where: {
      userId_itemType_itemSlug: {
        userId: alice.id,
        itemType: "lesson",
        itemSlug: "03-storage/01-hash-index",
      },
    },
    update: {},
    create: {
      userId: alice.id,
      itemType: "lesson",
      itemSlug: "03-storage/01-hash-index",
      status: "done",
      completedAt: new Date(),
    },
  });

  await prisma.progress.upsert({
    where: {
      userId_itemType_itemSlug: {
        userId: alice.id,
        itemType: "quiz",
        itemSlug: "03-storage/01-hash-index",
      },
    },
    update: {},
    create: {
      userId: alice.id,
      itemType: "quiz",
      itemSlug: "03-storage/01-hash-index",
      status: "done",
      score: 80,
      completedAt: new Date(),
    },
  });

  await prisma.progress.upsert({
    where: {
      userId_itemType_itemSlug: {
        userId: bob.id,
        itemType: "lesson",
        itemSlug: "03-storage/02-lsm-tree",
      },
    },
    update: {},
    create: {
      userId: bob.id,
      itemType: "lesson",
      itemSlug: "03-storage/02-lsm-tree",
      status: "in_progress",
    },
  });

  console.log("Seed complete:", { alice: alice.email, bob: bob.email });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
