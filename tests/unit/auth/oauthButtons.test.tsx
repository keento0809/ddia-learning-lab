import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

/**
 * 03文書T-005 受入基準「OAuthは環境変数未設定時にUI非表示となること」。
 * components/auth/OAuthButtons.tsxはフックを使わない純粋な関数コンポーネントの
 * ため、レンダラを介さず直接呼び出して返り値(React要素ツリー)を検証できる。
 */
describe("OAuthButtons visibility", () => {
  it("renders nothing when no OAuth providers are enabled", () => {
    const result = OAuthButtons({ locale: "ja", providers: [], callbackUrl: "/ja" });
    expect(result).toBeNull();
  });

  it("renders one button per enabled provider, with locale-specific labels", () => {
    type OAuthButton = ReactElement<{ "data-testid": string; children: string }>;
    const result = OAuthButtons({
      locale: "en",
      providers: ["github", "google"],
      callbackUrl: "/en",
    }) as ReactElement<{ children: OAuthButton[] }>;

    expect(result).not.toBeNull();
    const buttons = result.props.children;
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.props["data-testid"])).toEqual([
      "auth-oauth-github",
      "auth-oauth-google",
    ]);
    expect(buttons.map((button) => button.props.children)).toEqual([
      "Continue with GitHub",
      "Continue with Google",
    ]);
  });
});
