import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma-workerd/client";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createResetToken,
  decodeUnverifiedSubject,
  verifyResetToken,
} from "@/lib/auth/resetToken";
import {
  CredentialsSchema,
  ResetConfirmRequestSchema,
  ResetRequestSchema,
  SignupRequestSchema,
} from "@/lib/auth/schemas";
import type { Env } from "../env";
import { problemResponse } from "../problem";

/**
 * ADR-008(docs/design/09) §2・§4 T-503: 認証のDB操作(Credentials照合・
 * OAuthアカウントupsert)をworker-apiに置く。worker-appはlib/auth/config.ts
 * (Auth.js)から、およびapp/api/auth/{signup,reset/request,reset/confirm}/route.ts
 * (薄いフォワーダ化)からservice binding経由でここへ到達する
 * (これらのRoute Handler自体はworker-appに残る。02§2 architecture参照)。
 *
 * worker-appのpackage依存からPrismaを完全除去するため、09の成果物に明記された
 * verify-credentials/oauth-upsertの2本に加え、signup/reset-request/reset-confirmも
 * ここに実装する(いずれも「認証のDB操作」であり、Prisma除去という受入基準を
 * 満たすには他に選択肢がない。lib/db.ts・prisma/seed.ts・tests/integration/**は
 * 開発/テスト専用でありビルド成果物に含まれないため変更不要)。
 *
 * これらのルートはrequireSession対象外(pre-auth操作のため検証すべきセッションが
 * 存在しない)。worker-api自体が非公開・service binding経由のみ到達可能
 * (../index.tsに公開ルートが存在しない)ため、追加の共有シークレットなしで
 * 既存の他ルートと同じ隔離前提に乗る。
 */

type Bindings = Env;
type Variables = { prisma: PrismaClient };

const OAuthUpsertRequestSchema = z.object({
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(50).nullish(),
});

interface UserSummary {
  id: string;
  email: string;
  displayName: string;
}

function toUserSummary(user: { id: string; email: string; displayName: string }): UserSummary {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export const internalAuthRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

internalAuthRoute.post(
  "/verify-credentials",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
    }

    const parsed = CredentialsSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(
        c,
        400,
        "about:blank#validation-error",
        "validation_error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }

    const prisma = c.get("prisma");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !user.passwordHash || user.deletedAt) {
      return problemResponse(c, 401, "about:blank#invalid-credentials", "invalid_credentials");
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return problemResponse(c, 401, "about:blank#invalid-credentials", "invalid_credentials");
    }

    return c.json(toUserSummary(user), 200);
  },
);

internalAuthRoute.post(
  "/oauth-upsert",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
    }

    const parsed = OAuthUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(
        c,
        400,
        "about:blank#validation-error",
        "validation_error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    const { provider, providerAccountId, email, name } = parsed.data;
    const prisma = c.get("prisma");

    const existingAccount = await prisma.oauthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
    if (existingAccount) {
      return c.json(toUserSummary(existingAccount.user), 200);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    const user =
      existingUser ??
      (await prisma.user.create({
        data: { email, displayName: name ?? email.split("@")[0] },
      }));

    await prisma.oauthAccount.create({ data: { userId: user.id, provider, providerAccountId } });

    return c.json(toUserSummary(user), 200);
  },
);

internalAuthRoute.post(
  "/signup",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
    }

    const parsed = SignupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(
        c,
        400,
        "about:blank#validation-error",
        "validation_error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }

    const { email, password, displayName } = parsed.data;
    const passwordHash = await hashPassword(password);
    const prisma = c.get("prisma");

    try {
      const user = await prisma.user.create({ data: { email, passwordHash, displayName } });
      return c.json({ id: user.id, email: user.email }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return problemResponse(c, 409, "about:blank#email-taken", "email_taken");
      }
      throw error;
    }
  },
);

internalAuthRoute.post(
  "/reset-request",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
    }

    const parsed = ResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(c, 400, "about:blank#validation-error", "validation_error");
    }

    const prisma = c.get("prisma");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || user.deletedAt) {
      return c.json({ resetToken: null }, 200);
    }

    const resetToken = await createResetToken(user.id, user.passwordHash, c.env.AUTH_SECRET);
    return c.json({ resetToken }, 200);
  },
);

internalAuthRoute.post(
  "/reset-confirm",
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
    }

    const parsed = ResetConfirmRequestSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(c, 400, "about:blank#validation-error", "validation_error");
    }
    const { token, password } = parsed.data;
    const prisma = c.get("prisma");

    const unverifiedSub = decodeUnverifiedSubject(token);
    const user = unverifiedSub ? await prisma.user.findUnique({ where: { id: unverifiedSub } }) : null;
    if (!user || user.deletedAt) {
      return problemResponse(c, 400, "about:blank#invalid-token", "invalid_or_expired_token");
    }

    const verified = await verifyResetToken(token, user.passwordHash, c.env.AUTH_SECRET);
    if (!verified || verified.userId !== user.id) {
      return problemResponse(c, 400, "about:blank#invalid-token", "invalid_or_expired_token");
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return c.json({ status: "ok" }, 200);
  },
);
