import { getCloudflareContext } from "@opennextjs/cloudflare";
import { problemResponse } from "@/lib/auth/http";

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
 *
 * T-712: 転送先はworker-apiの公開APIである/api/配下に限定する。URLの解釈の差で
 * ルーティング時のパスと実際の転送先がずれないよう、転送するURLそのもので判定する。
 * 認証用の内部エンドポイントはlib/auth/workerApiAuth.tsが別経路で呼び出すため、
 * ここを通る必要がない。
 */
function isForwardableApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/") || pathname === "/api/") {
    return false;
  }
  try {
    return pathname.split("/").every((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !/[/\\]/.test(decoded);
    });
  } catch {
    return false;
  }
}

export async function dispatchToWorkerApi(request: Request): Promise<Response> {
  if (!isForwardableApiPath(new URL(request.url).pathname)) {
    return problemResponse(404, "about:blank#not-found", "not_found");
  }
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
