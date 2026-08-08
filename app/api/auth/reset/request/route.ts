import type { NextRequest } from "next/server";
import { resetRequestViaWorkerApi } from "@/lib/auth/workerApiAuth";
import { problemResponse } from "@/lib/auth/http";

/**
 * パスワードリセット要求。メール送信基盤(ADR-007に定義なし、07人間作業
 * チェックリストにもSMTP系の秘密情報記載なし)が本プロジェクトに存在しないため、
 * T-705(docs/security/findings.md Critical #1)でworker-api側
 * (workers/api/src/routes/internalAuth.ts `/internal/auth/reset-request`)が
 * resetTokenを一切発行・返却しない実装に修正済み(以前はレスポンスへ直接
 * トークンを返しており、メールアドレスを知るだけの第三者がアカウントを
 * 乗っ取れる認証バイパスだった)。メール送信基盤が導入されるまでリセット完了
 * フローは実質的に無効化されている。該当ユーザーの存在有無にかかわらず
 * 常に同一の応答を返す(メールアドレス列挙対策)。
 *
 * ADR-008(docs/design/09) §2・§4 T-503: ユーザー検索はworker-apiの
 * `/internal/auth/reset-request`へ移設した。このRoute Handlerは薄いフォワーダ。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  return resetRequestViaWorkerApi(body);
}
