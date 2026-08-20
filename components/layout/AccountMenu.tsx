"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

export function getInitials(displayName?: string | null): string | null {
  if (!displayName) return null;
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const chars =
    parts.length >= 2 ? [parts[0]?.[0], parts[parts.length - 1]?.[0]] : [parts[0]?.[0]];
  const initials = chars.filter(Boolean).join("").toUpperCase();
  return initials || null;
}

/**
 * イニシャルが導出できない(表示名未設定)場合の最終フォールバック。
 * (4)「イニシャル...またはデフォルトのアイコン画像でフォールバック」の
 * 「デフォルトのアイコン画像」側にあたる汎用の人型アイコン。
 */
function DefaultAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.6-5-8-5Z" />
    </svg>
  );
}

export function AccountAvatar({
  avatarUrl,
  displayName,
  altText,
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  altText: string;
}) {
  const initials = getInitials(displayName);

  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
      {initials ? <span aria-hidden="true">{initials}</span> : <DefaultAvatarIcon />}
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudflare Workers上ではnext/imageの最適化サーバが既定で使えないため(ADR-007、components/mdx/Figure.tsxと同じ理由)
        <img
          src={avatarUrl}
          alt={altText}
          className="absolute inset-0 h-full w-full object-cover"
          // 初期状態は非表示(下に敷いたイニシャル/デフォルトアイコンを見せる)にし、
          // onLoad成功時のみ表示へ切り替える設計(React state不使用: このコンポーネントは
          // tests/unit/layout/AccountMenu.test.tsxがレンダラを介さず直接関数呼び出し
          // するため、フックを使うと"Invalid hook call"で落ちる。下記handleLogoutの
          // 既存コメントと同じ制約)。
          //
          // 当初はonErrorのみでフォールバックしていたが、CSP img-src違反による
          // ブロック時にonErrorが発火しない実装(WebKit/Safari系ブラウザの既知の
          // 挙動差異、CSP違反はネットワークエラーとして扱われずerrorイベントを
          // 発火させない場合がある)が確認され、壊れた画像アイコンが表示されたまま
          // フォールバックに切り替わらない不具合(PR#141→本修正)につながった。
          // 初期非表示+onLoadで表示に切り替える方式なら、CSPブロック時に
          // onErrorが発火しなくても(img自体が非表示のままなので)フォールバック
          // 表示が保たれる。onErrorも念のため残す(画像ホスト到達後のHTTPエラー
          // 等、CSP以外の失敗要因では引き続きerrorイベントが確実に発火するため)。
          style={{ display: "none" }}
          onLoad={(event) => {
            event.currentTarget.style.display = "";
          }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

export function AccountMenu({
  locale,
  isAuthenticated,
  avatarUrl,
  displayName,
}: {
  locale: Locale;
  isAuthenticated: boolean;
  avatarUrl?: string | null;
  displayName?: string | null;
}) {
  const t = getMessages(locale).account;

  function handleLogout() {
    // qa-evaluator指摘(PR#127): signOut失敗時に無反応になっていた
    // (fetch失敗がハンドルされないunhandled rejectionのままメニューだけ閉じる)。
    // useState等のフックはこのコンポーネントを直接関数呼び出しするテスト
    // (tests/unit/layout/AccountMenu.test.tsx、レンダラを介さない)と相性が
    // 悪く、@testing-library/react等の新規依存追加なしには導入できないため
    // (CLAUDE.md規則1: 未依頼の依存追加禁止)、ユーザー向けUIフィードバックは
    // 追加せず、少なくとも失敗を握りつぶさずログに残す。
    signOut({ callbackUrl: `/${locale}/auth/signin` }).catch((error: unknown) => {
      console.error("AccountMenu: signOut failed", error);
    });
  }

  // 未ログイン時: 従来は「アカウント」ボタン→ドロップダウンを開く→
  // 「ログイン」を選ぶという2段階の導線だったが、ヘッダー上に直接クリック
  // 可能な「ログイン」リンクを出す1クリック導線に変更する(ドロップダウン
  // 自体を使わない)。遷移先は従来のドロップダウン内リンクと同じ/auth/signin。
  if (!isAuthenticated) {
    return (
      <Link
        href="/auth/signin"
        className="rounded px-2 py-1 hover:bg-neutral-100 hover:underline dark:hover:bg-neutral-800"
      >
        {t.signIn}
      </Link>
    );
  }

  const avatarAltText = displayName
    ? formatMessage(t.avatarAlt, { name: displayName })
    : t.avatarAltDefault;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t.menuAriaLabel}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
      >
        <AccountAvatar avatarUrl={avatarUrl} displayName={displayName} altText={avatarAltText} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="min-w-[10rem] rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        >
          {/* 設定(S-10)はログイン必須のため、未ログイン時にリンクを出すと
              クリックのたびにサインイン画面へ押し戻される体験になる。
              ログイン時のみ設定・ログアウトを提示する(未ログイン時は
              上記の直接リンクに置き換わったため、このメニュー自体を
              ログイン時専用にした)。
              ログアウトはnext-auth/reactのsignOut(クライアント安全)を使う:
              lib/auth/config.tsがexportするsignOutはnext/headers・next/navigation
              に依存するサーバ専用実装のため、このuse clientコンポーネントからは
              呼び出せない(DeleteAccountSection.tsxと同じ理由・同じ手段)。
              遷移はsignOut自身のcallbackUrl・window.location.href任せにし、
              useRouter等のフックは使わない: tests/unit/layout/AccountMenu.test.tsx
              がAccountMenu(...)をレンダラを介さず直接関数呼び出しして返り値の
              要素ツリーを検証する構成のため、本体内でフックを呼ぶと
              "Invalid hook call"で落ちる(このタスクで実機確認済み)。 */}
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="block cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
            >
              {t.settings}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={handleLogout}
            className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
          >
            {t.logout}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
