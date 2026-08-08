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

/**
 * T-705 Medium #4(docs/security/findings.md): wrangler.jsonc の
 * Rate Limiting API binding("AUTH_RATE_LIMITER")の構造的型。
 * Cloudflareのエッジ側で状態を保持するため、Workers isolate間で共有される
 * (lib/auth/rateLimit.ts参照)。
 */
interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    API: WorkerApiFetcher;
    // T-505(ADR-008 §4): 未設定時はlib/sentry/toucan.tsがno-opする。
    SENTRY_DSN?: string;
    // T-705 Medium #4: ローカル実行環境(next dev単体・vitest)では到達しない
    // ため、lib/auth/rateLimit.tsのisAuthRateLimitedはgetCloudflareContext()の
    // 例外を捕捉してisolate単位のフォールバックへ委譲する。
    AUTH_RATE_LIMITER: RateLimiterBinding;
  }
}

export {};
