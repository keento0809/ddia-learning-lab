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
 */
export async function dispatchToWorkerApi(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return env.API.fetch(request);
}
