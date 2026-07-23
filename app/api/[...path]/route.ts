import type { NextRequest } from "next/server";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

/**
 * ADR-008(docs/design/09) §2「/api/auth/* 以外の /api/* を service binding
 * 経由で worker-api へフォワードする」の一般化された受け皿。Next.jsの
 * ルーティングはより具体的なセグメント(app/api/progress/route.ts等、
 * app/api/auth/**)を優先して解決するため、このcatch-allは「他に一致する
 * Route Handlerが存在しない /api/* パス」にのみ到達する(/api/auth/*には
 * 到達しない)。既知の4ハンドラ(progress/submissions/dashboard/
 * guest-progress/import)は各自の専用Route Handlerが先に一致するため実質
 * 経由しないが、将来追加される非authの/api/*パスは自動的にここで
 * フォワードされる。
 */

export async function GET(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function POST(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function PUT(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function PATCH(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function DELETE(request: NextRequest) {
  return dispatchToWorkerApi(request);
}
