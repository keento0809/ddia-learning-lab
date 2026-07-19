"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readCsrfToken } from "./csrfToken";
import { fetchProgress, importGuestProgress } from "./api";
import { clearGuestProgress, readGuestProgress } from "./guestProgress";
import { useProgressStore } from "@/lib/store/progressStore";
import { PROGRESS_QUERY_KEY } from "./useProgressQuery";

/**
 * T-113「初回ログイン時にPOST /api/guest-progress/importを呼ぶ」の実行フック。
 * components/progress/GuestProgressImportGate.tsx(app/[locale]/layout.tsx配下、
 * 全ページ共通)から`isAuthenticated`(サーバ側auth()の結果)を受け取ってマウント時に
 * 一度だけ発火する。ログイン後の初回ページロードでlocalStorageの`guest-progress`が
 * 空でなければ取り込み、成功時のみlocalStorageを消去する(失敗時は次回ログイン時の
 * 再送に備えて残す)。
 *
 * 02§4.3と同じダブルサブミットCSRF方式のため、cookie未発行ならまずGET
 * /api/progressを1回叩く(lib/quiz/submitProgress.tsと同じパターン)。
 */
export function useGuestProgressImport(isAuthenticated: boolean): void {
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || attempted.current) return;

    const entries = readGuestProgress();
    if (entries.length === 0) return;

    attempted.current = true;

    (async () => {
      if (!readCsrfToken()) {
        await fetchProgress();
      }
      const result = await importGuestProgress(entries);
      clearGuestProgress();
      useProgressStore.getState().setAll(result.progress);
      await queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY });
    })().catch(() => {
      // 失敗しても静かに無視する。localStorageは消去しないため、次回ログイン時
      // (このフックの次回マウント)に再試行される。
      attempted.current = false;
    });
  }, [isAuthenticated, queryClient]);
}
