"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProgressRecord, SubmissionRecord } from "@/lib/contracts";
import { fetchLatestSubmission } from "./api";

const RECENT_SUBMISSIONS_LIMIT = 10;

/**
 * S-07「最近の提出履歴テーブル」(02§4.4)向け(T-112)。
 *
 * GetDashboardResponseSchema(lib/contracts、変更禁止)には提出履歴の一覧を返す
 * フィールドが無く、GET /api/submissions(T-109)も`exercise`必須パラメータの
 * 単一最新取得のみをサポートする(全演習横断の一覧取得は非対応)。新規APIや
 * 型追加(lib/contracts変更)を行わずに実現するため、ユーザーの進捗
 * (GET /api/progress、既存・変更なし)からitemType="exercise"のslug集合を求め、
 * 演習ごとにGET /api/submissions?exercise={slug}&latest=1を並行取得して
 * クライアント側でcreatedAt降順に統合する。
 *
 * 単一のuseQuery内でPromise.allにより並行取得する(TanStack Queryの
 * useQueriesは本タスクでのみ使用される追加コードパスのため、Cloudflare
 * Workers Freeプランのバンドルサイズ上限〈3MiB gzip、scripts/check-bundle-size.mjs〉
 * に抵触しないよう、既にlib/progress/*で使用されている既存のuseQueryのみで完結させる)。
 */
export function useRecentSubmissionsQuery(
  progressRecords: readonly ProgressRecord[],
  options?: { enabled?: boolean },
): { data: SubmissionRecord[]; isLoading: boolean } {
  const exerciseSlugs = Array.from(
    new Set(
      progressRecords.filter((record) => record.itemType === "exercise").map((record) => record.itemSlug),
    ),
  ).sort();
  const enabled = (options?.enabled ?? true) && exerciseSlugs.length > 0;

  const query = useQuery({
    queryKey: ["dashboard", "recent-submissions", exerciseSlugs] as const,
    queryFn: async () => {
      const submissions = await Promise.all(exerciseSlugs.map((slug) => fetchLatestSubmission(slug)));
      return submissions
        .filter((submission): submission is SubmissionRecord => submission != null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, RECENT_SUBMISSIONS_LIMIT);
    },
    enabled,
  });

  return { data: query.data ?? [], isLoading: enabled && query.isLoading };
}
