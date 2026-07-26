"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { GetNoteResponse } from "@/lib/contracts";
import { fetchNote } from "./api";

export function noteQueryKey(lessonSlug: string) {
  return ["note", lessonSlug] as const;
}

/**
 * 02§4.1右ペインのノート初期表示用。レッスンごとに`lessonSlug`単位でキャッシュする
 * (lib/progress/useProgressQuery.tsと同じ`enabled`ガード方式、未ログイン時は
 * GET /api/notesが401になるため呼び出さない)。
 */
export function useNoteQuery(
  lessonSlug: string,
  options?: { enabled?: boolean },
): UseQueryResult<GetNoteResponse> {
  return useQuery({
    queryKey: noteQueryKey(lessonSlug),
    queryFn: () => fetchNote(lessonSlug),
    enabled: options?.enabled ?? true,
  });
}
