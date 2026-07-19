"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  GetProgressResponse,
  ProgressItemType,
  ProgressRecord,
  ProgressStatus,
} from "@/lib/contracts";
import { useProgressStore } from "@/lib/store/progressStore";
import { currentClientTz, putProgress } from "./api";
import { PROGRESS_QUERY_KEY } from "./useProgressQuery";

export interface MarkProgressInput {
  itemType: ProgressItemType;
  itemSlug: string;
  status: ProgressStatus;
  score?: number;
}

interface MutationContext {
  previous: GetProgressResponse | undefined;
}

function buildOptimisticRecord(
  previous: ProgressRecord | undefined,
  input: MarkProgressInput,
): ProgressRecord {
  const now = new Date().toISOString();
  return {
    id: previous?.id ?? `optimistic:${input.itemSlug}`,
    itemType: input.itemType,
    itemSlug: input.itemSlug,
    status: input.status,
    score: input.score ?? previous?.score ?? null,
    completedAt:
      input.status === "done" ? (previous?.completedAt ?? now) : (previous?.completedAt ?? null),
    updatedAt: now,
  };
}

function replaceRecord(
  previous: GetProgressResponse | undefined,
  record: ProgressRecord,
): GetProgressResponse {
  const rest = (previous?.progress ?? []).filter((r) => r.itemSlug !== record.itemSlug);
  return { progress: [record, ...rest] };
}

/**
 * 02§4.1「『完了して次へ』押下でPUT /api/progressを楽観更新(TanStack Query
 * mutation、失敗時ロールバック)」/ 02§4.1「スクロール80%到達で自動的に
 * in_progress記録」の両方が使う共通mutationフック(T-105)。
 *
 * onMutateでTanStack Queryのキャッシュとlib/store/progressStore.tsの両方を
 * 即時更新し(楽観更新)、onErrorでonMutate時点のスナップショットへ両方とも
 * 巻き戻す(失敗時ロールバック)。
 */
export function useMarkProgressMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkProgressInput) =>
      putProgress({ ...input, clientTz: currentClientTz() }),
    onMutate: async (input): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey: PROGRESS_QUERY_KEY });
      const previous = queryClient.getQueryData<GetProgressResponse>(PROGRESS_QUERY_KEY);
      const previousRecord = previous?.progress.find((r) => r.itemSlug === input.itemSlug);

      // 02§3.1「statusの後退(done→in_progress)は無視(冪等・単調)」。サーバが
      // 無視するリクエストで楽観的に状態を後退させると、成功応答が返ってきた
      // 際に見た目が一瞬"done"→"in_progress"→"done"と揺れるため、クライアント
      // 側でも同じ単調性を先取りして適用し、後退時はキャッシュを変更しない。
      if (previousRecord?.status === "done" && input.status === "in_progress") {
        return { previous };
      }

      const nextRecord = buildOptimisticRecord(previousRecord, input);
      const nextData = replaceRecord(previous, nextRecord);
      queryClient.setQueryData(PROGRESS_QUERY_KEY, nextData);
      useProgressStore.getState().setOne(nextRecord);

      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(PROGRESS_QUERY_KEY, context?.previous);
      useProgressStore.getState().setAll(context?.previous?.progress ?? []);
    },
    onSuccess: (data) => {
      const previous = queryClient.getQueryData<GetProgressResponse>(PROGRESS_QUERY_KEY);
      const nextData = replaceRecord(previous, data.progress);
      queryClient.setQueryData(PROGRESS_QUERY_KEY, nextData);
      useProgressStore.getState().setOne(data.progress);
    },
  });
}
