"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function AccountMenu({ locale }: { locale: Locale }) {
  const t = getMessages(locale).account;

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
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              prefetch={false}
              className="block cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
            >
              {t.settings}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/auth"
              prefetch={false}
              className="block cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800"
            >
              {t.signIn}
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
