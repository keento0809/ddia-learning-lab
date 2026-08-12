import { describe, expect, it, vi } from "vitest";
import type { Account, Profile, User } from "next-auth";
import type { JWT } from "@auth/core/jwt";

/**
 * OIDCプロバイダ(Google)のバグ回帰テスト: jwtコールバックが
 * `account?.type === "oauth"`のみを見ていたため、`type: "oidc"`の
 * Googleサインインではoauth-upsertが一度も呼ばれず、Auth.js内部が
 * 生成するランダムなUUIDがtoken.uidに残っていた(DBに存在しない
 * ユーザーIDとしてセッション後続APIが401になる)。
 */
vi.mock("@/lib/auth/workerApiAuth", () => ({
  oauthUpsertViaWorkerApi: vi.fn(),
}));

import { oauthUpsertViaWorkerApi } from "@/lib/auth/workerApiAuth";
import { authConfig } from "@/lib/auth/config";

const jwtCallback = authConfig.callbacks?.jwt;
if (!jwtCallback) {
  throw new Error("authConfig.callbacks.jwt is not defined");
}

function baseToken(): JWT {
  return { sub: "auth-js-random-sub" };
}

describe("lib/auth/config jwt callback: OAuth/OIDCプロバイダ双方でoauth-upsertを呼ぶ", () => {
  it.each([
    { providerType: "oauth" as const, provider: "github", label: "GitHub(oauth)" },
    { providerType: "oidc" as const, provider: "google", label: "Google(oidc)" },
  ])(
    "$label: account.type=$providerTypeでoauth-upsertが呼ばれ、DB上の実ユーザーIDがtoken.uidに設定される",
    async ({ providerType, provider }) => {
      vi.mocked(oauthUpsertViaWorkerApi).mockReset();
      const dbUser = { id: "db-user-id-123", email: "user@example.com", displayName: "Real User" };
      vi.mocked(oauthUpsertViaWorkerApi).mockResolvedValue(dbUser);

      const account: Account = {
        provider,
        providerAccountId: "provider-account-id-1",
        type: providerType,
      };
      const profile: Profile = { email: "user@example.com", name: "Real User" };
      const user: User = { id: "auth-js-random-sub", email: "user@example.com" };

      const token = await jwtCallback({
        token: baseToken(),
        user,
        account,
        profile,
        trigger: "signIn",
      });

      expect(oauthUpsertViaWorkerApi).toHaveBeenCalledWith({
        provider,
        providerAccountId: "provider-account-id-1",
        email: "user@example.com",
        name: "Real User",
      });
      // DBに存在しないAuth.js内部生成のランダムUUID(user.id)ではなく、
      // oauth-upsertが返した実DBユーザーIDが書き込まれること。
      expect(token).not.toBeNull();
      expect(token?.uid).toBe(dbUser.id);
      expect(token?.uid).not.toBe(user.id);
    },
  );

  it("oauth-upsertが409相当(null)を返す場合はサインインを失敗させる(token.uidを設定しない)", async () => {
    vi.mocked(oauthUpsertViaWorkerApi).mockReset();
    vi.mocked(oauthUpsertViaWorkerApi).mockResolvedValue(null);

    const account: Account = {
      provider: "google",
      providerAccountId: "provider-account-id-2",
      type: "oidc",
    };
    const profile: Profile = { email: "conflict@example.com" };
    const user: User = { id: "auth-js-random-sub-2", email: "conflict@example.com" };

    await expect(
      jwtCallback({ token: baseToken(), user, account, profile, trigger: "signIn" }),
    ).rejects.toThrow("oauth_account_link_conflict");
  });

  it("Credentialsサインイン(account.type=\"credentials\")は従来どおりuser.idをtoken.uidに設定する(回帰確認)", async () => {
    vi.mocked(oauthUpsertViaWorkerApi).mockReset();

    // @auth/core/lib/actions/callback/index.js: Credentialsサインインではaccountは
    // nullではなく`{ type: "credentials", providerAccountId, provider }`が渡される。
    const user: User = { id: "credentials-user-id", email: "cred@example.com" };
    const account: Account = {
      type: "credentials",
      provider: "credentials",
      providerAccountId: "credentials-user-id",
    };
    const token = await jwtCallback({
      token: baseToken(),
      user,
      account,
      trigger: "signIn",
    });

    expect(oauthUpsertViaWorkerApi).not.toHaveBeenCalled();
    expect(token?.uid).toBe("credentials-user-id");
  });
});
