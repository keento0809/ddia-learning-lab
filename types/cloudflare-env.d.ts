/**
 * ADR-008(docs/design/09) §2: wrangler.jsonc の service binding("API"、
 * worker-apiへの参照)を @opennextjs/cloudflare の CloudflareEnv に反映する。
 *
 * `@cloudflare/workers-types` は本プロジェクトの依存に含まれておらず
 * (tsconfig.jsonのskipLibCheck:trueにより実体のない`Fetcher`参照は暗黙に
 * 素通りしてしまうため)、実際に使う`.fetch()`のみを持つ最小限の構造的型を
 * 自前で定義する(any禁止のため)。
 */
interface WorkerApiFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

declare global {
  interface CloudflareEnv {
    API: WorkerApiFetcher;
    // T-505(ADR-008 §4): 未設定時はlib/sentry/toucan.tsがno-opする。
    SENTRY_DSN?: string;
  }
}

export {};
