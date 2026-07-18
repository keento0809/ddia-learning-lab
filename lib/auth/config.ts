import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { buildPrismaAuthAdapter } from "@/lib/auth/adapter";
import { verifyPassword } from "@/lib/auth/password";
import { CredentialsSchema } from "@/lib/auth/schemas";
import { getEnabledOAuthProviders } from "@/lib/auth/providers";
import { routing } from "@/lib/i18n/routing";

/**
 * Auth.js設定。02§1「認証(Auth.js)」/ §2.1 users・oauth_accounts / 03文書T-005。
 *
 * セッション戦略はJWT(strategy:"jwt")。DBセッションテーブルは02§2.1の8テーブルに
 * 含まれないため、セッション状態はHTTPOnly CookieのJWTのみで保持する
 * (T-004決定事項ログ: 02§2.1は「全8テーブル」で確定済み、本タスクでのスキーマ
 * 追加は行わない)。
 */
const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "email", type: "email" },
      password: { label: "password", type: "password" },
    },
    async authorize(rawCredentials) {
      const parsed = CredentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) {
        return null;
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash || user.deletedAt) {
        return null;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return null;
      }

      return { id: user.id, email: user.email, name: user.displayName };
    },
  }),
];

const enabledOAuthProviders = getEnabledOAuthProviders();
if (enabledOAuthProviders.includes("github")) {
  providers.push(
    GitHub({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }),
  );
}
if (enabledOAuthProviders.includes("google")) {
  providers.push(
    Google({ clientId: process.env.GOOGLE_ID, clientSecret: process.env.GOOGLE_SECRET }),
  );
}

export const authConfig: NextAuthConfig = {
  adapter: buildPrismaAuthAdapter(),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers,
  pages: {
    // ロケール別ルーティング(app/[locale]/auth/signin)のため、既定ロケールの
    // パスをフォールバックとする(現時点でこのpagesはT-005外の保護ルートが
    // 未実装のため未使用だが、将来のauthorized callback導入に備えて明示する)。
    signIn: `/${routing.defaultLocale}/auth/signin`,
  },
  cookies: {
    // 02§1「セッションはHTTPOnly Cookie」/ 03文書T-005「SameSite=Lax」を明示。
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
