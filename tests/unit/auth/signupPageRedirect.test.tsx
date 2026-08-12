import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * app/[locale]/dashboard/page.tsxの「未認証→/auth/signinへredirect」と対になる
 * ガード: ログイン済みで/auth/signupへ直接アクセスした場合は/dashboardへ誘導する
 * (既にアカウントがあるためサインアップの意味がない)。dashboard/page.tsxと同じ
 * `@/lib/auth/config`のauth()・`@/lib/i18n/navigation`のredirectをモックし、
 * ページ関数を直接呼び出して分岐を検証する。
 */
const authMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/i18n/navigation")>(
    "@/lib/i18n/navigation",
  );
  return {
    ...actual,
    redirect: (...args: unknown[]) => redirectMock(...args),
  };
});

describe("SignUpPage auth redirect", () => {
  afterEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
  });

  it("ログイン済みで直接アクセスすると/dashboardへredirectする", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { default: SignUpPage } = await import("@/app/[locale]/auth/signup/page");

    await SignUpPage({ params: Promise.resolve({ locale: "en" }) });

    expect(redirectMock).toHaveBeenCalledWith({ href: "/dashboard", locale: "en" });
  });

  it("未ログイン時はredirectせずサインアップ画面を描画する", async () => {
    authMock.mockResolvedValue(null);
    const { default: SignUpPage } = await import("@/app/[locale]/auth/signup/page");

    const result = (await SignUpPage({
      params: Promise.resolve({ locale: "ja" }),
    })) as ReactElement<{ children: ReactElement[] }>;

    expect(redirectMock).not.toHaveBeenCalled();
    const heading = result.props.children[0] as ReactElement<{ children: string }>;
    expect(heading.props.children).toBe("サインアップ");
  });
});
