import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { Header } from "@/components/layout/Header";

/**
 * ヘッダー左端ロゴのクリック時遷移先: AccountMenu.tsxと同じisAuthenticated
 * (呼び出し元layout.tsxのauth()結果)で分岐する。ログイン済みは/dashboardへ、
 * 未ログインは従来通り/(ランディング)へ。AccountMenu.test.tsxと同じく、
 * レンダラを介さずHeader(...)を直接関数呼び出しし、返り値の要素ツリーから
 * ロゴLinkのhref/文言を検証する。
 */
type LogoLink = ReactElement<{ href: string; children: string }>;

function getLogoLink(result: ReactElement): LogoLink {
  const [logo] = (result.props as { children: [LogoLink, ReactElement, ReactElement] }).children;
  return logo;
}

describe("Header logo link", () => {
  it("未ログイン時はロゴが従来通り/へリンクする", () => {
    const logo = getLogoLink(Header({ locale: "en", isAuthenticated: false }));

    expect(logo.props.href).toBe("/");
    expect(logo.props.children).toBe("DDIA Learning Lab");
  });

  it("ログイン済み時はロゴが/dashboardへリンクする", () => {
    const logo = getLogoLink(Header({ locale: "en", isAuthenticated: true }));

    expect(logo.props.href).toBe("/dashboard");
    expect(logo.props.children).toBe("DDIA Learning Lab");
  });

  it("日本語ロケールでもログイン済み時は/dashboardへリンクする(文言は日本語のまま)", () => {
    const loggedOut = getLogoLink(Header({ locale: "ja", isAuthenticated: false }));
    expect(loggedOut.props.href).toBe("/");

    const loggedIn = getLogoLink(Header({ locale: "ja", isAuthenticated: true }));
    expect(loggedIn.props.href).toBe("/dashboard");
    expect(loggedIn.props.children).toBe("DDIA Learning Lab");
  });
});
