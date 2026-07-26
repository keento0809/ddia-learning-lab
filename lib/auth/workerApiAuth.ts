import { getCloudflareContext } from "@opennextjs/cloudflare";
import { problemResponse } from "@/lib/auth/http";

/**
 * ADR-008(docs/design/09) §2・§4 T-503: 認証のDB操作(Credentials照合・
 * OAuthアカウントupsert・サインアップ・パスワードリセット)をworker-apiの
 * `/internal/auth/*`へservice binding経由で委譲する唯一の入口。
 *
 * lib/api/workerApiDispatch.ts(dispatchToWorkerApi)とは意図的に分離する。
 * 向こうは「元のユーザーリクエストをそのままフォワードする」用途(既存セッション
 * cookieを転送する必要がある)で、tests/integration/setup.tsのモックは
 * `auth()`の戻り値をJWT cookieへ変換して合成する仕組みを持つ。一方こちらは
 * 「新規に組み立てた内部リクエスト」を送るだけの用途(サインアップ等はpre-auth
 * 操作でありセッションが存在しない)であり、混在させるとauth()呼び出しの都合
 * (Next.jsのリクエストスコープ外で例外になり得る)がテストに波及するため、
 * 別モジュール・別モックとして扱う(tests/integration/setup.ts参照)。
 */
async function callWorkerApiAuth(path: string, body: unknown): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const request = new Request(`http://worker-api.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return env.API.fetch(request);
}

export interface WorkerApiUserSummary {
  id: string;
  email: string;
  displayName: string;
}

export async function verifyCredentialsViaWorkerApi(
  email: string,
  password: string,
): Promise<WorkerApiUserSummary | null> {
  const response = await callWorkerApiAuth("/internal/auth/verify-credentials", {
    email,
    password,
  });
  if (response.status !== 200) {
    return null;
  }
  return (await response.json()) as WorkerApiUserSummary;
}

export async function oauthUpsertViaWorkerApi(input: {
  provider: string;
  providerAccountId: string;
  email: string;
  name?: string | null;
}): Promise<WorkerApiUserSummary> {
  const response = await callWorkerApiAuth("/internal/auth/oauth-upsert", input);
  return (await response.json()) as WorkerApiUserSummary;
}

/**
 * サインアップ・パスワードリセットの3エンドポイントは、呼び出し元のRoute Handler
 * (app/api/auth/{signup,reset/request,reset/confirm}/route.ts)がそのまま
 * `return`する薄いフォワーダとして使うため、生のResponseを返す(status・
 * Content-Type(application/problem+json含む)をworker-api側の実装
 * (workers/api/src/routes/internalAuth.ts)と1バイトも変えずに再現するため、
 * ここでbodyをパースし直さない)。
 *
 * qa-evaluator検出: service binding呼び出し(callWorkerApiAuth)が失敗すると
 * 例外がRoute Handlerまで伝播し、Problem Details形式ではない生の500(空ボディ)
 * が返っていた(02§3の全API共通契約に違反)。この3関数はRoute Handlerが結果を
 * そのまま返す薄いフォワーダのため、ここで捕捉しProblem Detailsへ変換する。
 */
export async function signupViaWorkerApi(body: unknown): Promise<Response> {
  try {
    return await callWorkerApiAuth("/internal/auth/signup", body);
  } catch {
    return problemResponse(503, "about:blank#auth-service-unavailable", "auth_service_unavailable");
  }
}

export async function resetRequestViaWorkerApi(body: unknown): Promise<Response> {
  try {
    return await callWorkerApiAuth("/internal/auth/reset-request", body);
  } catch {
    return problemResponse(503, "about:blank#auth-service-unavailable", "auth_service_unavailable");
  }
}

export async function resetConfirmViaWorkerApi(body: unknown): Promise<Response> {
  try {
    return await callWorkerApiAuth("/internal/auth/reset-confirm", body);
  } catch {
    return problemResponse(503, "about:blank#auth-service-unavailable", "auth_service_unavailable");
  }
}
