import { CSRF_HEADER_NAME } from "@/lib/api/csrfConstants";
import type { PostSubmissionRequest, PostSubmissionResponse } from "@/lib/contracts";
import { readCsrfToken } from "@/lib/progress/csrfToken";

/**
 * T-108e 演習ページ→提出APIのクライアント側fetchラッパ。
 * 参照設計: 02§3.1(代表I/O定義)、02§3.2(演習提出フロー)。
 * `lib/notes/api.ts`/`lib/progress/api.ts`と同じダブルサブミットCSRF cookie方式。
 */
export class SubmissionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SubmissionApiError";
  }
}

/**
 * CSRF cookieはGET /api/progress応答(worker-api側、02§3共通仕様)で発行される。
 * S-06(演習ページ)はレッスン/クイズ画面と異なり進捗取得を行わずに直接開かれうる
 * ため(`lib/quiz/submitProgress.ts`と同じ理由)、cookie未発行ならこのPOSTの前に
 * 明示的に1回GETしてから送る。
 */
async function ensureCsrfCookie(): Promise<void> {
  if (readCsrfToken()) return;
  await fetch("/api/progress", { method: "GET", credentials: "same-origin" });
}

export async function postSubmission(
  body: PostSubmissionRequest,
): Promise<PostSubmissionResponse> {
  await ensureCsrfCookie();
  const csrfToken = readCsrfToken();
  const response = await fetch("/api/submissions", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new SubmissionApiError(
      response.status,
      `POST /api/submissions failed (${response.status})`,
    );
  }
  return (await response.json()) as PostSubmissionResponse;
}
