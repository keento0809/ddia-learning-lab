import type { NextRequest } from "next/server";
import { signupViaWorkerApi } from "@/lib/auth/workerApiAuth";
import { problemResponse } from "@/lib/auth/http";

/**
 * 03文書T-005受入基準「サインアップ→ログイン→セッション取得のAPI統合テスト」の起点。
 * 02§1「認証はセッションCookie」の対象外(ログイン前のためCredentialsProviderの
 * 対象外エンドポイント)。作成後のログインはクライアントがsignIn("credentials")を
 * 別途呼び出す(このエンドポイントはユーザー作成のみを担う)。
 *
 * ADR-008(docs/design/09) §2・§4 T-503: ユーザー作成(Prisma操作)はworker-apiの
 * `/internal/auth/signup`へ移設した。このRoute Handlerはリクエストボディの検証・
 * DB操作を行わず、service binding経由の応答(status・Content-Type・body)を
 * そのまま返す薄いフォワーダ(workers/api/src/routes/internalAuth.tsが
 * 同一のバリデーション・エラー形状を再現する)。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  return signupViaWorkerApi(body);
}
