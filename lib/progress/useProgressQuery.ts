"use client";

import { useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { GetProgressResponse } from "@/lib/contracts";
import { useProgressStore } from "@/lib/store/progressStore";
import { fetchProgress } from "./api";

/** GET /api/progress のクエリキー(useMarkProgressMutation.tsからも参照) */
export const PROGRESS_QUERY_KEY = ["progress"] as const;

/**
 * 02§4.3「ログイン時は GET /api/progress を1回取得し、Zustandにキャッシュして
 * カードへオーバーレイ」(T-105)。
 *
 * `enabled`(既定true)にサーバ側で判定済みのログイン状態を渡すことを想定する
 * (page.tsx/layout.tsxがauth()で取得したセッションの有無)。未ログイン時に
 * `enabled:false`で無効化しないと、ブラウザは401応答を「Failed to load
 * resource」としてconsoleに記録する(verify-webappスキルの「新規のエラー・
 * 警告がゼロであること」に反する、実機確認で検出)。
 */
export function useProgressQuery(options?: { enabled?: boolean }): UseQueryResult<GetProgressResponse> {
  const query = useQuery({
    queryKey: PROGRESS_QUERY_KEY,
    queryFn: fetchProgress,
    enabled: options?.enabled ?? true,
  });

  useEffect(() => {
    if (query.data) {
      useProgressStore.getState().setAll(query.data.progress);
    }
  }, [query.data]);

  return query;
}
