"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AccountRecord } from "@/lib/settings/schemas";
import { fetchAccount } from "./api";

export const ACCOUNT_QUERY_KEY = ["account"] as const;

/** GET /api/account のクエリフック(T-308)。S-10設定画面の各フォームの初期値source。 */
export function useAccountQuery(options?: { enabled?: boolean }): UseQueryResult<AccountRecord> {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: fetchAccount,
    enabled: options?.enabled ?? true,
  });
}
