import type { NextRequest } from "next/server";
import { resetRequestViaWorkerApi } from "@/lib/auth/workerApiAuth";
import { problemResponse } from "@/lib/auth/http";

/**
 * パスワードリセット要求。メール送信基盤(ADR-007に定義なし、07人間作業
 * チェックリストにもSMTP系の秘密情報記載なし)が本プロジェクトに存在しないため、
 * 「メールを送信した」という偽の成功文言は出さず(CLAUDE.md規則3)、
 * リセットリンクをレスポンスとして直接返す設計とする。
 * 該当ユーザーが存在しない場合もリンクを返さず200を返し(メールアドレス列挙対策)、
 * UI側は常に同一の案内を表示する。
 *
 * ADR-008(docs/design/09) §2・§4 T-503: ユーザー検索・トークン発行(Prisma操作+
 * AUTH_SECRET署名)はworker-apiの`/internal/auth/reset-request`へ移設した。
 * このRoute Handlerは薄いフォワーダ。
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
