"use client";

import { useGuestProgressImport } from "@/lib/progress/useGuestProgressImport";

/**
 * T-113。app/[locale]/layout.tsx(全ページ共通)にマウントし、ログイン済みの
 * 初回ページロードでlocalStorageのゲスト進捗をサーバへ取り込む。画面には
 * 何も描画しない(バックグラウンド処理のみ、失敗時もUIへは影響させない設計、
 * lib/progress/useGuestProgressImport.ts参照)。
 */
export function GuestProgressImportGate({ isAuthenticated }: { isAuthenticated: boolean }) {
  useGuestProgressImport(isAuthenticated);
  return null;
}
