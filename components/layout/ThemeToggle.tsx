"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/lib/store/themeStore";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function ThemeToggle({ locale }: { locale: Locale }) {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const t = getMessages(locale).theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? t.switchToLight : t.switchToDark}
      aria-pressed={isDark}
      onClick={toggleTheme}
      className="rounded p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2a1 1 0 0 1 1 1v1.5a1 1 0 1 1-2 0V19a1 1 0 0 1 1-1Zm7.5-6.5a1 1 0 0 1 1-1H22a1 1 0 1 1 0 2h-1.5a1 1 0 0 1-1-1Zm-15 0a1 1 0 0 1 1 1H4a1 1 0 1 1 0-2h1.5a1 1 0 0 1 1 1Zm12.02-6.02a1 1 0 0 1 1.415 0l.354.354a1 1 0 0 1-1.415 1.415l-.354-.354a1 1 0 0 1 0-1.415Zm-11.09 11.09a1 1 0 0 1 1.414 0l.354.354a1 1 0 0 1-1.414 1.414l-.354-.353a1 1 0 0 1 0-1.415Zm11.09.001.353-.354a1 1 0 1 1 1.415 1.415l-.354.353a1 1 0 0 1-1.414-1.414ZM5.99 5.283l.354-.354A1 1 0 0 1 7.76 6.344l-.354.354A1 1 0 1 1 5.99 5.283Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M20.742 13.045a8.5 8.5 0 1 1-9.79-9.79.75.75 0 0 1 .919.918 7 7 0 0 0 8.954 8.954.75.75 0 0 1 .917.918Z" />
        </svg>
      )}
    </button>
  );
}
