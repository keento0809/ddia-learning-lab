import type { GetDashboardResponse, GetSubmissionResponse } from "@/lib/contracts";

/**
 * S-07 ダッシュボード(T-112)のクライアント側fetchラッパ。
 * 参照設計: 02§3.1(代表I/O定義)、02§4.4(ダッシュボード画面)。
 */
export class DashboardApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

export async function fetchDashboard(): Promise<GetDashboardResponse> {
  const response = await fetch("/api/dashboard", { credentials: "same-origin" });
  if (!response.ok) {
    throw new DashboardApiError(response.status, `GET /api/dashboard failed (${response.status})`);
  }
  return (await response.json()) as GetDashboardResponse;
}

/**
 * 「最近の提出履歴」テーブル(02§4.4)向け。lib/contracts/api.ts の
 * GetDashboardResponseSchema(02§3.1の代表I/O定義どおり、変更禁止)には提出履歴
 * フィールドが無いため、既存のGET /api/submissions?exercise={slug}&latest=1
 * (T-109、変更なし)を演習slugごとに呼び出し、クライアント側で集約する。
 */
export async function fetchLatestSubmission(
  exerciseSlug: string,
): Promise<GetSubmissionResponse["submission"]> {
  const response = await fetch(
    `/api/submissions?exercise=${encodeURIComponent(exerciseSlug)}&latest=1`,
    { credentials: "same-origin" },
  );
  if (!response.ok) {
    throw new DashboardApiError(
      response.status,
      `GET /api/submissions failed (${response.status})`,
    );
  }
  const body = (await response.json()) as GetSubmissionResponse;
  return body.submission;
}
