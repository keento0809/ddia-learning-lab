import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { AccountAvatar, AccountMenu, getInitials } from "@/components/layout/AccountMenu";

/**
 * PR#127 qa-evaluator指摘: signOut失敗時に無反応(unhandled rejection)に
 * なっていたため、AccountMenu.tsxのhandleLogoutは.catch()でログを残すように
 * なった。tests/unit/settings/SettingsWithData.test.tsxと同じくnext-auth/react
 * をモックして検証する。
 */
const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

/**
 * ヘッダー右端アカウント表示の回帰テスト: components/layout/AccountMenu.tsx。
 * PROMPT_HEADER_AVATARで、未ログイン時の2段階導線(「アカウント」ボタン→
 * ドロップダウン内「ログイン」)を廃止し、ヘッダー上に直接クリック可能な
 * 「ログイン」リンクを出す1クリック導線に変更した。ログイン中は
 * トリガーの文言(「アカウント」)をアバターアイコンに差し替えたが、
 * クリック時の挙動(ドロップダウンの中身・遷移先)は変更していない。
 *
 * このコンポーネントはRadix依存の描画を、レンダラを介さず直接関数呼び出しして
 * 返り値(React要素ツリー)を検証する既存パターン(tests/unit/auth/
 * oauthButtons.test.tsxと同じ)を踏襲する。未ログイン時はAccountMenuが
 * <Link>を直接返すため、DropdownMenu.Root/Portal/Contentのアンラップが
 * 不要になった(ログイン時のみそれらのアンラップが必要)。
 */
type ItemLink = ReactElement<{ href: string; children: string }>;
type SettingsItem = ReactElement<{ children: ItemLink }>;
type LogoutItem = ReactElement<{ onSelect: () => void; children: string }>;
type AvatarElement = ReactElement<{
  avatarUrl?: string | null;
  displayName?: string | null;
  altText: string;
}>;
type Trigger = ReactElement<{ "aria-label": string; children: AvatarElement }>;
type Content = ReactElement<{ children: [SettingsItem, LogoutItem] }>;
type Portal = ReactElement<{ children: Content }>;

function getAuthenticatedTree(result: ReactElement) {
  const [trigger, portal] = (result.props as { children: [Trigger, Portal] }).children;
  const content = portal.props.children;
  return { trigger, content };
}

describe("AccountMenu: 未ログイン時は直接クリック可能な「ログイン」リンクを出す", () => {
  it("ドロップダウンを介さず、ヘッダー上の<Link>として直接/auth/signinへリンクする", () => {
    const result = AccountMenu({ locale: "en", isAuthenticated: false }) as ItemLink;

    expect(result.props.href).toBe("/auth/signin");
    expect(result.props.children).toBe("Sign in");
  });

  it("日本語ロケールでは文言が「ログイン」になる(遷移先は同じ/auth/signin)", () => {
    const result = AccountMenu({ locale: "ja", isAuthenticated: false }) as ItemLink;

    expect(result.props.href).toBe("/auth/signin");
    expect(result.props.children).toBe("ログイン");
  });
});

describe("AccountMenu: ログイン中はトリガーがアバターになるが、メニューの中身は不変", () => {
  it("トリガーはaria-label付きのままで、中身がAccountAvatarに置き換わる", () => {
    const { trigger } = getAuthenticatedTree(
      AccountMenu({
        locale: "en",
        isAuthenticated: true,
        avatarUrl: "https://example.com/avatar.png",
        displayName: "Ada Lovelace",
      }),
    );

    expect(trigger.props["aria-label"]).toBe("Open account menu");
    expect(trigger.props.children.props.avatarUrl).toBe("https://example.com/avatar.png");
    expect(trigger.props.children.props.displayName).toBe("Ada Lovelace");
    expect(trigger.props.children.props.altText).toBe("Ada Lovelace's avatar");
  });

  it("表示名が無い場合は既定のalt文言を使う", () => {
    const { trigger } = getAuthenticatedTree(
      AccountMenu({ locale: "ja", isAuthenticated: true, avatarUrl: null, displayName: null }),
    );

    expect(trigger.props.children.props.altText).toBe("ユーザーのアバター画像");
  });

  it("設定・ログアウトの2項目は従来通り(設定は/settingsへリンク)", () => {
    const { content } = getAuthenticatedTree(
      AccountMenu({ locale: "en", isAuthenticated: true }),
    );
    const [settingsItem, logoutItem] = content.props.children;
    const settingsLink = settingsItem.props.children;

    expect(settingsLink.props.href).toBe("/settings");
    expect(settingsLink.props.children).toBe("Settings");
    expect(logoutItem.props.children).toBe("Log out");
    expect(typeof logoutItem.props.onSelect).toBe("function");
  });

  it("日本語ロケールでもメニュー項目文言が切り替わる", () => {
    const { content } = getAuthenticatedTree(
      AccountMenu({ locale: "ja", isAuthenticated: true }),
    );
    const [settingsItem, logoutItem] = content.props.children;

    expect(settingsItem.props.children.props.children).toBe("設定");
    expect(logoutItem.props.children).toBe("ログアウト");
  });
});

describe("AccountMenu logout handler", () => {
  afterEach(() => {
    signOutMock.mockReset();
    vi.restoreAllMocks();
  });

  it("signOutをcallbackUrl付きで呼ぶ", () => {
    signOutMock.mockResolvedValue(undefined);
    const { content } = getAuthenticatedTree(
      AccountMenu({ locale: "en", isAuthenticated: true }),
    );
    const [, logoutItem] = content.props.children;

    logoutItem.props.onSelect();

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/en/auth/signin" });
  });

  it("signOut失敗時に無反応(unhandled rejection)にならず、console.errorに記録する", async () => {
    const failure = new Error("network error");
    signOutMock.mockRejectedValue(failure);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { content } = getAuthenticatedTree(
      AccountMenu({ locale: "ja", isAuthenticated: true }),
    );
    const [, logoutItem] = content.props.children;

    logoutItem.props.onSelect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith("AccountMenu: signOut failed", failure);
  });
});

describe("getInitials: 表示名からのイニシャル導出", () => {
  it("2語の表示名は各語の頭文字を大文字で結合する", () => {
    expect(getInitials("Ada Lovelace")).toBe("AL");
  });

  it("3語以上の表示名は先頭語と末尾語の頭文字のみを使う", () => {
    expect(getInitials("Grace Brewster Hopper")).toBe("GH");
  });

  it("1語の表示名は先頭文字のみを大文字にする", () => {
    expect(getInitials("madhatter")).toBe("M");
  });

  it("表示名が無い/空文字の場合はnullを返す", () => {
    expect(getInitials(null)).toBeNull();
    expect(getInitials(undefined)).toBeNull();
    expect(getInitials("   ")).toBeNull();
  });
});

describe("AccountAvatar: 画像・イニシャル・デフォルトアイコンのフォールバック", () => {
  it("avatarUrlがある場合はimgを描画し、altTextを設定する", () => {
    const avatar = AccountAvatar({
      avatarUrl: "https://example.com/avatar.png",
      displayName: "Ada Lovelace",
      altText: "Ada Lovelace's avatar",
    });
    const [, img] = avatar.props.children as [ReactElement, ReactElement<{ src: string; alt: string }>];

    expect(img.props.src).toBe("https://example.com/avatar.png");
    expect(img.props.alt).toBe("Ada Lovelace's avatar");
  });

  it("画像読み込み失敗(onError)時はimgを非表示にし、下のイニシャルへフォールバックする", () => {
    const avatar = AccountAvatar({
      avatarUrl: "https://example.com/broken.png",
      displayName: "Ada Lovelace",
      altText: "Ada Lovelace's avatar",
    });
    const [initialsSpan, img] = avatar.props.children as [
      ReactElement<{ children: string }>,
      ReactElement<{ onError: (event: { currentTarget: { style: { display: string } } }) => void }>,
    ];
    const fakeEvent = { currentTarget: { style: { display: "" } } };

    expect(initialsSpan.props.children).toBe("AL");
    img.props.onError(fakeEvent);

    expect(fakeEvent.currentTarget.style.display).toBe("none");
  });

  it("avatarUrlが無い場合はimgを描画しない", () => {
    const avatar = AccountAvatar({ avatarUrl: null, displayName: "Ada Lovelace", altText: "x" });
    const children = avatar.props.children as [ReactElement, null];

    expect(children[1]).toBeNull();
  });

  it("displayNameが無い場合はイニシャルの代わりにデフォルトアイコンを描画する", () => {
    const avatar = AccountAvatar({ avatarUrl: null, displayName: null, altText: "x" });
    const [fallback] = avatar.props.children as [ReactElement<{ children?: unknown }>, null];

    // イニシャルの<span>は文字列children、デフォルトアイコンは<svg>(children未使用)。
    expect(fallback.props.children).toBeUndefined();
  });
});
