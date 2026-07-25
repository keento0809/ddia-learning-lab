import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * ADR-008(docs/design/09) §2: worker-app側から service binding("API") 経由で
 * worker-apiへリクエストを委譲する唯一の入口。実行環境(本番Worker/`wrangler dev`)
 * では Cloudflare の service binding(Fetcher)を使う。
 *
 * テスト(vitest, Node環境)は Cloudflare コンテキストを持たないため、この関数を
 * モックしworker-api(workers/api/src/index.tsのHonoアプリ)へインプロセスで
 * 委譲する(実際のバンドル・実bindings込みの検証はworkers/api/tests/、
 * Miniflare上で別途行う)。
 *
 * **失敗→恒久対策**: Next.jsのRoute Handlerが受け取る`request`(NextRequest)を
 * そのまま`env.API.fetch(request)`に渡すと、本番(workerd)で
 * `TypeError: Invalid URL: [object Object]`が発生する(NextRequestはCloudflare
 * Service Bindingの`Fetcher.fetch()`が期待するworkerd自身の`Request`インスタンス
 * ではないため)。Miniflare上のservice bindingテスト(serviceBinding.test.ts)は
 * 素の`Request`を使う最小スタブのみを検証しておりこの不整合を検出できなかった。
 * Cloudflareの公式パターン(service bindingへは常に明示的に`new Request(...)`で
 * 再構築したものを渡す)に合わせ、url/method/headers/bodyのみを転送する素の
 * `Request`を都度組み立ててから委譲する。
 */
export async function dispatchToWorkerApi(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
  };
  if (request.body) {
    init.duplex = "half";
  }
  const forwarded = new Request(request.url, init);
  return env.API.fetch(forwarded);
}
