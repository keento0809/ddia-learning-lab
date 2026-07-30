import type { NextRequest } from "next/server";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

/**
 * GET/PATCH/DELETE /api/account。S-10設定画面(T-308)。ADR-008(docs/design/09)
 * §2の方針どおり、実装はworkers/api/src/routes/account.ts(Hono、Prisma+JWT検証)に
 * 置き、このRoute Handlerはservice binding経由で委譲するだけの薄いフォワーダ
 * (app/api/progress/route.tsと同じ形)。
 */

export async function GET(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function PATCH(request: NextRequest) {
  return dispatchToWorkerApi(request);
}

export async function DELETE(request: NextRequest) {
  return dispatchToWorkerApi(request);
}
