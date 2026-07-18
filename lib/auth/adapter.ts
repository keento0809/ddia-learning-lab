import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Auth.js用の最小アダプタ。02§2.1のusers/oauth_accountsテーブル(T-004で確定済み、
 * 本タスクではスキーマ変更不可)にAuth.jsの標準User/Accountモデルを写像する。
 * セッション戦略はJWT(lib/auth/config.ts)のため、createSession等のDB
 * セッション系メソッドは実装不要(Adapter型では全メソッド任意)。
 */

type UserRow = Awaited<ReturnType<PrismaClient["user"]["create"]>>;

function toAdapterUser(user: UserRow): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    // usersテーブルにemail_verifiedは存在しない(02§2.1)。Emailプロバイダ
    // (マジックリンク)は本タスクの対象外のため常にnullで返す。
    emailVerified: null,
    name: user.displayName,
  };
}

export function buildPrismaAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const created = await prisma.user.create({
        data: {
          email: user.email,
          displayName: user.name ?? user.email.split("@")[0],
        },
      });
      return toAdapterUser(created);
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await prisma.oauthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    async updateUser(user) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.email !== undefined ? { email: user.email } : {}),
          ...(user.name !== undefined && user.name !== null
            ? { displayName: user.name }
            : {}),
        },
      });
      return toAdapterUser(updated);
    },

    async linkAccount(account) {
      await prisma.oauthAccount.create({
        data: {
          userId: account.userId,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },
  };
}
