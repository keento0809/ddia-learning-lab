"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GetNoteResponse } from "@/lib/contracts";
import { putNote } from "./api";
import { noteQueryKey } from "./useNoteQuery";

/**
 * PUT /api/notes/{lessonSlug} のmutation(T-307)。呼び出し元(LessonNotes)が
 * lib/notes/debouncedNoteSaver.tsの2s debounceトリガーからmutateを呼ぶため、
 * ここでは楽観更新は行わず、成功時にクエリキャッシュを最新値へ更新するのみ
 * (進捗のようにボタン即時反映が要件ではなく、テキスト入力自体が既に
 * ユーザーへの即時フィードバックのため)。
 */
export function useSaveNoteMutation(lessonSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bodyMd: string) => putNote(lessonSlug, bodyMd),
    onSuccess: (note) => {
      const data: GetNoteResponse = { note };
      queryClient.setQueryData(noteQueryKey(lessonSlug), data);
    },
  });
}
