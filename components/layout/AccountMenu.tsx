"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function AccountMenu({
  locale,
  isAuthenticated,
}: {
  locale: Locale;
  isAuthenticated: boolean;
}) {
  const t = getMessages(locale).account;

  function handleLogout() {
    void signOut({ callbackUrl: `/${locale}/auth/signin` });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t.menuAriaLabel}
        className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {t.menuLabel}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="min-w-[10rem] rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-900"
        >
          {/* 設定(S-10)はログイン必須のため、未ログイン時にリンクを出すと
              クリックのたびにサインイン画面へ押し戻される体験になる。
              未ログイン時はサインインのみ、ログイン時は設定・ログアウトを提示する。
              ログアウトはnext-auth/reactのsignOut(クライアント安全)を使う:
              lib/auth/config.tsがexportするsignOutはnext/headers・next/navigation
              に依存するサーバ専用実装のため、このuse clientコンポーネントからは
              呼び出せない(DeleteAccountSection.tsxと同じ理由・同じ手段)。
              遷移はsignOut自身のcallbackUrl・window.location.href任せにし、
              useRouter等のフックは使わない: tests/unit/layout/AccountMenu.test.tsx
              がAccountMenu(...)をレンダラを介さず直接関数呼び出しして返り値の
              要素ツリーを検証する構成のため、本体内でフックを呼ぶと
              "Invalid hook call"で落ちる(このタスクで実機確認済み)。 */}
          {isAuthenticated ? (
            <>
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
            </>
          ) : (
            <DropdownMenu.Item asChild>
              <Link
                href="/auth/signin"
                className="block cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
              >
                {t.signIn}
              </Link>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
