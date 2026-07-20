"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { GetDashboardResponse } from "@/lib/contracts";
import { fetchDashboard } from "./api";

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

/** GET /api/dashboard のクエリフック(T-112)。02§4.4のダッシュボード画面全体のデータ源。 */
export function useDashboardQuery(options?: {
  enabled?: boolean;
}): UseQueryResult<GetDashboardResponse> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboard,
    enabled: options?.enabled ?? true,
  });
}
