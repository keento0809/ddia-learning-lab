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
 *
 * ログイン済み分岐(true側)はSettingsに続けてLogout項目を出すため2要素になり、
 * JSXは<>{settings}{logout}</>というFragmentを返す。getContentが返す
 * Content(DropdownMenu.Content要素)のprops.childrenは(三項演算子の単一式
 * なので)そのFragment自体1個であり、Fragment.props.childrenが
 * [settingsItem, logoutItem]の配列になる。未ログイン分岐(false側)は従来通り
 * Content.props.childrenが単一のItem要素のまま。
 */
type ItemLink = ReactElement<{ href: string; children: string }>;
type LinkItem = ReactElement<{ children: ItemLink }>;
type LogoutItem = ReactElement<{ onSelect: () => void; children: string }>;
type AuthenticatedFragment = ReactElement<{ children: [LinkItem, LogoutItem] }>;
type Content = ReactElement<{ children: LinkItem | AuthenticatedFragment }>;
type Portal = ReactElement<{ children: Content }>;

function getContent(result: ReactElement): Content {
  const [, portal] = (result.props as { children: [ReactElement, Portal] }).children;
  return portal.props.children;
}

describe("AccountMenu auth-state-dependent items", () => {
  it("未ログイン時は「サインイン」のみを提示し、/auth/signinへリンクする(ログアウト項目は出ない)", () => {
    const content = getContent(AccountMenu({ locale: "en", isAuthenticated: false }));
    const item = content.props.children as LinkItem;
    const link = item.props.children;

    expect(link.props.href).toBe("/auth/signin");
    expect(link.props.children).toBe("Sign in");
  });

  it("ログイン済み時は「設定」と「ログアウト」を提示し、設定は/settingsへリンクする", () => {
    const content = getContent(AccountMenu({ locale: "en", isAuthenticated: true }));
    const fragment = content.props.children as AuthenticatedFragment;
    const [settingsItem, logoutItem] = fragment.props.children;
    const settingsLink = settingsItem.props.children;

    expect(settingsLink.props.href).toBe("/settings");
    expect(settingsLink.props.children).toBe("Settings");
    expect(logoutItem.props.children).toBe("Log out");
    expect(typeof logoutItem.props.onSelect).toBe("function");
  });

  it("日本語ロケールでも項目文言が切り替わる", () => {
    const loggedOut = getContent(AccountMenu({ locale: "ja", isAuthenticated: false }));
    const loggedOutItem = loggedOut.props.children as LinkItem;
    expect(loggedOutItem.props.children.props.children).toBe("ログイン");

    const loggedIn = getContent(AccountMenu({ locale: "ja", isAuthenticated: true }));
    const loggedInFragment = loggedIn.props.children as AuthenticatedFragment;
    const [settingsItem, logoutItem] = loggedInFragment.props.children;
    expect(settingsItem.props.children.props.children).toBe("設定");
    expect(logoutItem.props.children).toBe("ログアウト");
  });
});
