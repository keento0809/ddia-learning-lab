import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ddia-ui-theme";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * 02§6「UI状態(ペイン幅/テーマ/目次開閉) → Zustand + localStorage」に対応。
 * 実際のDOMへの反映(<html>へのdarkクラス付与)はThemeToggle/ThemeInit側で行う。
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    { name: THEME_STORAGE_KEY },
  ),
);
