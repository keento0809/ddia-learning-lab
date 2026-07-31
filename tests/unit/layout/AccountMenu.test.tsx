import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { AccountMenu } from "@/components/layout/AccountMenu";

/**
 * 回帰テスト: components/layout/AccountMenu.tsx。
 * 修正前は未ログイン時の「ログイン」項目が存在しない/auth(index)を指しており
 * page not foundになっていた。またisAuthenticatedを見ずに常に「設定」
 * (ログイン必須)と「ログイン」の両方を出していたため、未ログイン時に「設定」を
 * 押すとサインインへ押し戻される体験だった。tests/unit/auth/oauthButtons.test.tsx
 * と同じく、Radix依存の描画コンポーネントをレンダラを介さず直接呼び出し、
 * 返り値(React要素ツリー)からリンク先とメニュー項目数を検証する。
 */
type ItemLink = ReactElement<{ href: string; children: string }>;
type MenuItem = ReactElement<{ children: ItemLink }>;
type Content = ReactElement<{ children: MenuItem }>;
type Portal = ReactElement<{ children: Content }>;

function getContent(result: ReactElement): Content {
  const [, portal] = (result.props as { children: [ReactElement, Portal] }).children;
  return portal.props.children;
}

describe("AccountMenu auth-state-dependent items", () => {
  it("未ログイン時は「サインイン」のみを提示し、/auth/signinへリンクする", () => {
    const content = getContent(AccountMenu({ locale: "en", isAuthenticated: false }));
    const item = content.props.children;
    const link = item.props.children;

    expect(link.props.href).toBe("/auth/signin");
    expect(link.props.children).toBe("Sign in");
  });

  it("ログイン済み時は「設定」のみを提示し、/settingsへリンクする", () => {
    const content = getContent(AccountMenu({ locale: "en", isAuthenticated: true }));
    const item = content.props.children;
    const link = item.props.children;

    expect(link.props.href).toBe("/settings");
    expect(link.props.children).toBe("Settings");
  });

  it("日本語ロケールでも項目文言が切り替わる", () => {
    const loggedOut = getContent(AccountMenu({ locale: "ja", isAuthenticated: false }));
    expect(loggedOut.props.children.props.children.props.children).toBe("ログイン");

    const loggedIn = getContent(AccountMenu({ locale: "ja", isAuthenticated: true }));
    expect(loggedIn.props.children.props.children.props.children).toBe("設定");
  });
});
