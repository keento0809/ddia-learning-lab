import type { NextRequest } from "next/server";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

/**
 * GET /api/dashboard。ADR-008(docs/design/09) §2・T-502により、実装は
 * workers/api/src/routes/dashboard.ts(Hono、Prisma+JWT検証)へ移設した。
 * このRoute Handlerはservice binding経由でworker-apiへ委譲するだけの薄い
 * フォワーダ(dispatchToWorkerApi、lib/api/workerApiDispatch.ts)。
 */

export async function GET(request: NextRequest) {
  return dispatchToWorkerApi(request);
}
