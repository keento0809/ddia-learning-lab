import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { callWorkerApi, createTestUser, sessionCookieFor } from "./helpers/workerApi";

/**
 * T-703 AU-4(docs/design/11_ADR-011 §3.2)。IDOR: 他ユーザーのnote/submission/
 * progressをID指定で取得・更新できないか。ユーザーA・Bの2つの実セッションを発行し、
 * Bのセッションでは常にA所有のリソースへ到達できない(=自分自身の別レコードとして
 * しか扱われない)ことを実DBの状態まで確認する。
 */
describe("AU-4: IDOR(他ユーザーのnote/submission/progress)", () => {
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    await prisma.$connect();
    userA = await createTestUser();
    userB = await createTestUser();
    cookieA = await sessionCookieFor(userA.id);
    cookieB = await sessionCookieFor(userB.id);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  function csrfHeaders(cookie: string, csrfToken: string) {
    return {
      "Content-Type": "application/json",
      cookie: `${cookie}; csrf-token=${csrfToken}`,
      "x-csrf-token": csrfToken,
    };
  }

  it("notes: Bの同一lessonSlugへのGETはAの本文を返さない(ユーザーごとに独立したレコード)", async () => {
    const lessonSlug = "01-reliability/01-reliability-and-faults";
    const putA = await callWorkerApi(
      new Request(`http://worker-api.internal/api/notes/${lessonSlug}`, {
        method: "PUT",
        headers: csrfHeaders(cookieA, "au4-csrf-notes"),
        body: JSON.stringify({ bodyMd: "userA-secret-note" }),
      }),
    );
    expect(putA.status).toBe(200);

    const getB = await callWorkerApi(
      new Request(`http://worker-api.internal/api/notes/${lessonSlug}`, { headers: { cookie: cookieB } }),
    );
    expect(getB.status).toBe(200);
    const bodyB = (await getB.json()) as { note: { bodyMd: string } | null };
    expect(bodyB.note).toBeNull();

    // BがPUTしても、Aのレコードは独立して残る(上書きされない)。
    const putB = await callWorkerApi(
      new Request(`http://worker-api.internal/api/notes/${lessonSlug}`, {
        method: "PUT",
        headers: csrfHeaders(cookieB, "au4-csrf-notes-b"),
        body: JSON.stringify({ bodyMd: "userB-own-note" }),
      }),
    );
    expect(putB.status).toBe(200);

    const getAAfter = await callWorkerApi(
      new Request(`http://worker-api.internal/api/notes/${lessonSlug}`, { headers: { cookie: cookieA } }),
    );
    const bodyAAfter = (await getAAfter.json()) as { note: { bodyMd: string } | null };
    expect(bodyAAfter.note?.bodyMd).toBe("userA-secret-note");
  });

  it("notes: リクエストボディにuserIdフィールドを混入させても無視され、常にセッションのユーザーに紐づく(スキーマ外フィールドの無視)", async () => {
    const lessonSlug = "01-reliability/02-scalability";
    const put = await callWorkerApi(
      new Request(`http://worker-api.internal/api/notes/${lessonSlug}`, {
        method: "PUT",
        headers: csrfHeaders(cookieB, "au4-csrf-notes-spoof"),
        body: JSON.stringify({ bodyMd: "spoof-attempt", userId: userA.id }),
      }),
    );
    expect(put.status).toBe(200);

    const row = await prisma.note.findUnique({
      where: { userId_lessonSlug: { userId: userB.id, lessonSlug } },
    });
    expect(row).not.toBeNull();
    const asA = await prisma.note.findUnique({
      where: { userId_lessonSlug: { userId: userA.id, lessonSlug } },
    });
    expect(asA).toBeNull();
  });

  it("submissions: BのGETはAが作成したsubmissionを返さない", async () => {
    const exerciseSlug = "01-reliability/lab-availability-budget";
    const postA = await callWorkerApi(
      new Request("http://worker-api.internal/api/submissions", {
        method: "POST",
        headers: csrfHeaders(cookieA, "au4-csrf-sub"),
        body: JSON.stringify({
          exerciseSlug,
          language: "js",
          code: "// userA solution",
          result: "pass",
          passedTests: 1,
          totalTests: 1,
          graderVersion: "1.0.0",
        }),
      }),
    );
    expect(postA.status).toBe(201);

    const getB = await callWorkerApi(
      new Request(`http://worker-api.internal/api/submissions?exercise=${encodeURIComponent(exerciseSlug)}`, {
        headers: { cookie: cookieB },
      }),
    );
    expect(getB.status).toBe(200);
    const bodyB = (await getB.json()) as { submission: unknown };
    expect(bodyB.submission).toBeNull();
  });

  it("progress: BのGETはAの進捗を含まない。同一itemSlugへのPUTはBが自分の行として独立に持つ", async () => {
    const itemSlug = "01-reliability/01-reliability-and-faults";
    const putA = await callWorkerApi(
      new Request("http://worker-api.internal/api/progress", {
        method: "PUT",
        headers: csrfHeaders(cookieA, "au4-csrf-progress"),
        body: JSON.stringify({ itemType: "lesson", itemSlug, status: "done", clientTz: "UTC" }),
      }),
    );
    expect(putA.status).toBe(200);

    const getB = await callWorkerApi(
      new Request("http://worker-api.internal/api/progress", { headers: { cookie: cookieB } }),
    );
    const bodyB = (await getB.json()) as { progress: Array<{ userId?: string; itemSlug: string }> };
    expect(bodyB.progress.find((p) => p.itemSlug === itemSlug)).toBeUndefined();

    const rowA = await prisma.progress.findUnique({
      where: { userId_itemType_itemSlug: { userId: userA.id, itemType: "lesson", itemSlug } },
    });
    expect(rowA?.status).toBe("done");
    const rowB = await prisma.progress.findUnique({
      where: { userId_itemType_itemSlug: { userId: userB.id, itemType: "lesson", itemSlug } },
    });
    expect(rowB).toBeNull();
  });

  it("account: BのGETはAのアカウント情報(email等)を返さない", async () => {
    const getA = await callWorkerApi(
      new Request("http://worker-api.internal/api/account", { headers: { cookie: cookieA } }),
    );
    const bodyA = (await getA.json()) as { account: { email: string } };
    expect(bodyA.account.email).toBe(userA.email);

    const getB = await callWorkerApi(
      new Request("http://worker-api.internal/api/account", { headers: { cookie: cookieB } }),
    );
    const bodyB = (await getB.json()) as { account: { email: string } };
    expect(bodyB.account.email).toBe(userB.email);
    expect(bodyB.account.email).not.toBe(userA.email);
  });
});
