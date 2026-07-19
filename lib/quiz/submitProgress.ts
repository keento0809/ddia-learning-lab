import type { ProgressItemType, PutProgressResponse } from "@/lib/contracts";

/**
 * クイズ完了時の進捗API送信(T-106「スコア計算→進捗API送信」)。
 * PUT /api/progress自体はT-104(マージ済み)の既存API・既存contracts
 * (lib/contracts/api.ts)をそのまま利用する。02§4.3「状態変更系はまずGET
 * /api/progressを1回取得しCSRFトークン(非HttpOnly cookie)を発行させてから
 * 送る」という既存設計に従い、components/auth/SignUpForm.tsxと同様の
 * 直接fetchパターンで実装する(T-105が対象とするのはS-02/S-03の進捗
 * オーバーレイ・楽観的更新キャッシュであり、クイズ完了時の一回送信は
 * それに依存しない)。
 *
 * CSRF_COOKIE_NAME/CSRF_HEADER_NAMEの正はlib/api/csrf.tsだが、同ファイルは
 * node:cryptoに依存しクライアントバンドルへ含められないため、名前のみ複製する。
 */
const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface SubmitQuizProgressInput {
  moduleSlug: string;
  /** 0-100の整数(lib/quiz/scoring.tsのscoreQuiz().score) */
  score: number;
}

export type SubmitQuizProgressResult =
  | { ok: true; response: PutProgressResponse }
  | { ok: false; status: number };

export async function submitQuizProgress({
  moduleSlug,
  score,
}: SubmitQuizProgressInput): Promise<SubmitQuizProgressResult> {
  if (!readCookie(CSRF_COOKIE_NAME)) {
    await fetch("/api/progress", { method: "GET", credentials: "same-origin" });
  }
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const response = await fetch("/api/progress", {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    },
    body: JSON.stringify({
      itemType: "quiz" satisfies ProgressItemType,
      itemSlug: `${moduleSlug}/quiz`,
      status: "done",
      score,
      clientTz,
    }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const body = (await response.json()) as PutProgressResponse;
  return { ok: true, response: body };
}
