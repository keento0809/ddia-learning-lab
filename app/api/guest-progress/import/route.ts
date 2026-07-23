import type { NextRequest } from "next/server";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

/**
 * POST /api/guest-progress/import。ADR-008(docs/design/09) §2・T-502により、
 * 実装はworkers/api/src/routes/guestProgressImport.ts(Hono、Prisma+JWT検証)へ
 * 移設した。このRoute Handlerはservice binding経由でworker-apiへ委譲するだけの
 * 薄いフォワーダ(dispatchToWorkerApi、lib/api/workerApiDispatch.ts)。
 */

export async function POST(request: NextRequest) {
  return dispatchToWorkerApi(request);
}
