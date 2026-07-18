import { THEME_STORAGE_KEY } from "@/lib/store/themeStore";

/**
 * ハイドレーション前(beforeInteractive)に<html>へdarkクラスを適用し、
 * テーマ切替のFOUC(初期表示のちらつき)を防ぐブートストラップスクリプト。
 * zustand persistのlocalStorage保存形式({"state":{"theme":...},"version":0})
 * を直接読む。永続値が無ければ prefers-color-scheme にフォールバックする。
 */
export function buildThemeBootstrapScript(): string {
  return `(function(){try{var raw=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var theme=raw?JSON.parse(raw).state.theme:null;if(theme!=="light"&&theme!=="dark"){theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(theme==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;
}
