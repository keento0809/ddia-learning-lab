import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import {
  DeleteAccountRequestSchema,
  PatchAccountRequestSchema,
  type AccountRecord,
  type DeleteAccountResponse,
  type GetAccountResponse,
  type PatchAccountResponse,
} from "@/lib/settings/schemas";
import type { Env } from "../env";
import { CSRF_COOKIE_NAME, generateCsrfToken, verifyCsrfToken } from "../csrf";
import { problemResponse } from "../problem";

/**
 * GET/PATCH/DELETE /api/account。S-10設定画面(T-308)。ADR-008(docs/design/09)
 * §2に倣い、02§2.1 usersテーブル(display_name/locale_pref/theme_pref/deleted_at)
 * のみを扱う。他ルートと同じくrequireSession(../index.ts)通過後のみ到達する。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

interface AccountUserRow {
  id: string;
  email: string;
  displayName: string;
  localePref: string;
  themePref: string;
}

function toAccountRecord(user: AccountUserRow): AccountRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    localePref: user.localePref as AccountRecord["localePref"],
    themePref: user.themePref as AccountRecord["themePref"],
  };
}

export const accountRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

accountRoute.get("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const userId = c.get("userId");
  const prisma = c.get("prisma");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return problemResponse(c, 404, "about:blank#not-found", "not_found");
  }

  const body: GetAccountResponse = { account: toAccountRecord(user) };

  // progress.tsのGETと同じダブルサブミットCSRF cookie発行(未発行時のみ)。
  if (!getCookie(c, CSRF_COOKIE_NAME)) {
    setCookie(c, CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
    });
  }
  return c.json(body, 200);
});

accountRoute.patch("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
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

  const parsed = PatchAccountRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const { displayName, localePref, themePref } = parsed.data;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(localePref !== undefined ? { localePref } : {}),
      ...(themePref !== undefined ? { themePref } : {}),
    },
  });

  const responseBody: PatchAccountResponse = { account: toAccountRecord(updated) };
  return c.json(responseBody, 200);
});

accountRoute.delete("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
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

  const parsed = DeleteAccountRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return problemResponse(c, 404, "about:blank#not-found", "not_found");
  }

  if (parsed.data.confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      "confirmationEmail はアカウントのメールアドレスと一致する必要があります",
    );
  }

  /**
   * 02§2.1 deleted_at「論理削除 (GDPR即時物理削除ジョブ併用)」への対応方針:
   * このアプリにはCloudflare Queues/Cron等の非同期ジョブ基盤が存在しない
   * (ADR-007はQueuesを選択肢として言及するのみで未導入)ため、新規にジョブ
   * 基盤を追加するのはCLAUDE.md規則1(スコープ外の依存追加禁止)に抵触する。
   * そのため「即時物理削除」を選ぶ: deletedAtを立てる論理削除と、ユーザー行・
   * 関連8テーブル中6テーブル(oauth_accountsはDB側onDelete:Cascadeのため対象外)の
   * 物理削除を1つの$transactionにまとめる(qa-evaluator指摘対応: 以前は
   * deletedAt更新をトランザクション外で先にコミットしていたため、後続の
   * 物理削除だけが失敗すると「requireSessionにより本人は永久に401だが行は
   * 残り続け、本人にも運用者にも復旧手段がない」状態になり得た。原子化により
   * 途中失敗時は全体がロールバックし、削除は「成功して消え去るか、何も
   * 起きていない状態のまま500を返すか」のいずれかになる)。
   */
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
    prisma.progress.deleteMany({ where: { userId } }),
    prisma.submission.deleteMany({ where: { userId } }),
    prisma.note.deleteMany({ where: { userId } }),
    prisma.userBadge.deleteMany({ where: { userId } }),
    prisma.streak.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  const responseBody: DeleteAccountResponse = { status: "ok" };
  return c.json(responseBody, 200);
});
