import { vi } from "vitest";

/**
 * 失敗→恒久対策(T-502): docs/design/09(ADR-008)§4 T-502の受入基準「既存のAPI統合
 * テストが変更なしで全緑」を文字どおり満たすため、tests/integration/{progress.flow,
 * submissions.flow,dashboard.flow,guest-progress-import}.integration.test.ts は
 * 一切変更しない(既存の`vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }))`
 * パターンのまま)。
 *
 * 一方でworker-api(ADR-008 §2)はNext.jsのauth()を一切経由せず、Cookie内の
 * Auth.js JWTセッションを自己完結で検証する設計のため、`auth()`をモックするだけでは
 * 実際のリクエスト経路(dispatchToWorkerApi→worker-api)を素通りしてしまう。
 * そこでテストインフラ側(このグローバルセットアップ、vitest.integration.config.ts
 * のtest.setupFilesから読み込む)でこの差異を吸収する: dispatchToWorkerApiを
 * インターセプトし、各テストファイルがモックした`auth()`の戻り値を読み取って
 * 実際に署名したAuth.js形式のJWT Cookie(lib/auth/config.tsと同じsecret/salt/
 * cookie名)へ変換し、リクエストに付与したうえでworker-apiの本体
 * (workers/api/src/index.ts、実Honoアプリ・実JWT検証・実Prisma)をインプロセスで
 * 呼び出す。個々のテストの視点では「auth()をモックすればセッションが有効になる」
 * という既存の振る舞いが保たれたまま、実際にはworker-api側の本物のJWT検証・
 * ルーティング・DB処理を経由する。
 */
vi.mock("@/lib/api/workerApiDispatch", async () => {
  const { encode } = await import("@auth/core/jwt");
  const SESSION_COOKIE_NAME = "authjs.session-token";

  type SessionLike = { user?: { id?: string } } | null | undefined;

  return {
    dispatchToWorkerApi: async (request: Request): Promise<Response> => {
      const { auth } = await import("@/lib/auth/config");
      const session = (await (auth as () => Promise<unknown>)()) as SessionLike;
      const userId = session?.user?.id;

      let outgoing = request;
      if (typeof userId === "string") {
        const authSecret = process.env.AUTH_SECRET;
        if (!authSecret) {
          throw new Error("AUTH_SECRET is not set (run via npm run test:integration)");
        }
        const token = await encode({ token: { uid: userId }, secret: authSecret, salt: SESSION_COOKIE_NAME });
        const existingCookie = request.headers.get("cookie") ?? "";
        const mergedCookie = existingCookie
          ? `${existingCookie}; ${SESSION_COOKIE_NAME}=${token}`
          : `${SESSION_COOKIE_NAME}=${token}`;
        const headers = new Headers(request.headers);
        headers.set("cookie", mergedCookie);
        outgoing = new Request(request, { headers });
      }

      const { default: app } = await import("@/workers/api/src/index");
      return app.fetch(outgoing, {
        AUTH_SECRET: process.env.AUTH_SECRET!,
        DATABASE_URL: process.env.DATABASE_URL!,
      });
    },
  };
});

/**
 * T-503(ADR-008): lib/auth/workerApiAuth.ts(dispatchToWorkerApiとは別モジュール、
 * 同ファイルのコメント参照)も同様にworker-apiの本体(実Honoアプリ・実Prisma)へ
 * インプロセスで委譲する。こちらはCredentials照合・OAuth upsert・サインアップ・
 * パスワードリセットのpre-auth操作のみを扱うため、上のdispatchToWorkerApiモックと
 * 異なり`auth()`は一切呼ばない(呼ぶ必要がなく、tests/integration/auth.flow.
 * integration.test.tsのように`@/lib/auth/config`をモックしないテストファイルから
 * 呼ばれた場合に実`auth()`がNext.jsのリクエストスコープ外で例外になるのを避ける)。
 */
vi.mock("@/lib/auth/workerApiAuth", async () => {
  const bindings = {
    AUTH_SECRET: process.env.AUTH_SECRET!,
    DATABASE_URL: process.env.DATABASE_URL!,
  };

  async function callInternal(path: string, body: unknown): Promise<Response> {
    const { default: app } = await import("@/workers/api/src/index");
    const request = new Request(`http://worker-api.internal${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return app.fetch(request, bindings);
  }

  return {
    verifyCredentialsViaWorkerApi: async (email: string, password: string) => {
      const response = await callInternal("/internal/auth/verify-credentials", {
        email,
        password,
      });
      if (response.status !== 200) {
        return null;
      }
      return response.json();
    },
    oauthUpsertViaWorkerApi: async (input: unknown) => {
      const response = await callInternal("/internal/auth/oauth-upsert", input);
      return response.json();
    },
    signupViaWorkerApi: (body: unknown) => callInternal("/internal/auth/signup", body),
    resetRequestViaWorkerApi: (body: unknown) => callInternal("/internal/auth/reset-request", body),
    resetConfirmViaWorkerApi: (body: unknown) => callInternal("/internal/auth/reset-confirm", body),
  };
});
