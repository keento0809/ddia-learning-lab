import type { NextRequest } from "next/server";
import { dispatchToWorkerApi } from "@/lib/api/workerApiDispatch";

/**
 * GET /api/dashboard。ADR-008(docs/design/09) §2・T-502により、実装は
 * workers/api/src/routes/dashboard.ts(Hono、Prisma+JWT検証)へ移設した。
 * このRoute Handlerはservice binding経由でworker-apiへ委譲するだけの薄い
 * フォワーダ(dispatchToWorkerApi、lib/api/workerApiDispatch.ts)。
 *
 * GETの引数を宣言していないのは、移設前のGET()(引数なし、セッションはauth()
 * 内部でnext/headers経由に解決)を呼び出す既存のtests/integration/
 * dashboard.flow.integration.test.tsを変更しないため(T-502受入基準
 * 「既存のAPI統合テストが変更なしで全緑」)。`request?: NextRequest`や
 * デフォルト値付き引数では、Next.jsが`next build`/typecheck時に生成する
 * `.next/types/app/api/dashboard/route.ts`のParamCheckが`NextRequest |
 * undefined`を許容せず(非undefinedの`NextRequest`を要求)型エラーになる。
 * 一方Next.js本体は実行時、宣言の有無にかかわらず常に実requestを第一引数として
 * 渡すため(移設前の元実装が引数を宣言していなかったのに問題なく動いていたのと
 * 同じ理由)、`arguments[0]`で実際に渡された値を取得できる(引数を宣言していない
 * 通常のfunctionでもarguments自体は利用可能)。本番では実requestが、テストでは
 * undefined(テストはGET()を引数なしで呼ぶ)が入るため、undefinedの場合のみ
 * 空のフォールバックRequestを使う(テストはauth()モック経由でユーザーを解決する
 * ため、フォワード先のCookieヘッダ自体は不要)。
 */
export async function GET() {
  // eslint-disable-next-line prefer-rest-params -- 上記コメント参照。意図的にargumentsを使う。
  const request = (arguments[0] as NextRequest | undefined) ?? new Request("http://localhost/api/dashboard");
  return dispatchToWorkerApi(request);
}
