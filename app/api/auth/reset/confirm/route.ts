import type { NextRequest } from "next/server";
import { resetConfirmViaWorkerApi } from "@/lib/auth/workerApiAuth";
import { problemResponse } from "@/lib/auth/http";

/**
 * ADR-008(docs/design/09) §2・§4 T-503: トークン検証(署名検証・passwordHash
 * ダイジェスト照合)・パスワード更新(Prisma操作)はworker-apiの
 * `/internal/auth/reset-confirm`へ移設した。このRoute Handlerは薄いフォワーダ。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  return resetConfirmViaWorkerApi(body);
}
