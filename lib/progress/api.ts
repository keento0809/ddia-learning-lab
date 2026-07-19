import { CSRF_HEADER_NAME } from "@/lib/api/csrfConstants";
import type {
  GetProgressResponse,
  PutProgressRequest,
  PutProgressResponse,
} from "@/lib/contracts";
import { readCsrfToken } from "./csrfToken";

/**
 * T-105 進捗クライアント統合。GET/PUT /api/progress のクライアント側fetchラッパ。
 * 参照設計: 02§3.1(代表I/O定義)、02§4.3(ログイン時にGETを1回取得)、
 * 02§4.1(「完了して次へ」でPUT status:"done")。
 */
export class ProgressApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProgressApiError";
  }
}

export async function fetchProgress(): Promise<GetProgressResponse> {
  const response = await fetch("/api/progress", { credentials: "same-origin" });
  if (!response.ok) {
    throw new ProgressApiError(response.status, `GET /api/progress failed (${response.status})`);
  }
  return (await response.json()) as GetProgressResponse;
}

export async function putProgress(
  body: PutProgressRequest,
): Promise<PutProgressResponse> {
  const csrfToken = readCsrfToken();
  const response = await fetch("/api/progress", {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ProgressApiError(response.status, `PUT /api/progress failed (${response.status})`);
  }
  return (await response.json()) as PutProgressResponse;
}

export function currentClientTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
