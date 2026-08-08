import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { internalAuthRoute } from "@/workers/api/src/routes/internalAuth";
import { callWorkerApi } from "./helpers/workerApi";

/**
 * T-703 AU-5・AU-6(docs/design/11_ADR-011 §3.2)。
 *
 * AU-5: worker-apiへの直接アクセス可否(service binding前提の検証。公開ルートが
 *       ないこと)。scripts/check-worker-visibility.mjs(T-504、CI常設)と同じ
 *       wrangler.jsonc設定を、独立したテストとして再確認する(CIスクリプトが
 *       将来変更/削除されてもT-703のこのテストは別経路で同じ性質を検証し続ける)。
 * AU-6: /internal/auth/* の外部到達性。worker-api自体がservice binding経由のみ
 *       到達可能(AU-5)であることが、/internal/auth/*(requireSession対象外、
 *       追加の共有シークレットなし)の唯一の防御である設計(workers/api/src/routes/
 *       internalAuth.tsのコメント参照)ことを実際にHonoアプリを呼んで確認する。
 */

// wrangler.jsonc内のコメントは常に行頭"//"の独立行という、
// scripts/check-worker-visibility.mjsと同じ前提でJSON.parseする。
function readJsonc(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf-8");
  const stripped = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(stripped);
}

describe("AU-5: worker-apiの非公開設定(workers_dev:false, routes未設定)", () => {
  const config = readJsonc("workers/api/wrangler.jsonc");

  it("workers_devがfalseに明示されている(既定値trueだと<name>.workers.devが公開される)", () => {
    expect(config.workers_dev).toBe(false);
  });

  it("routes/routeが設定されていない(公開ルートを持たない)", () => {
    expect(config.routes).toBeUndefined();
    expect(config.route).toBeUndefined();
  });

  it("worker-app側はAPIというservice binding名でのみworker-apiを参照する(直接URLではない)", () => {
    const appConfig = readJsonc("wrangler.jsonc");
    const services = appConfig.services as Array<{ binding: string; service: string }>;
    expect(services).toEqual([{ binding: "API", service: "ddia-learning-lab-api" }]);
  });
});

describe("AU-6: /internal/auth/* の外部到達性", () => {
  it("/internal/auth/* にはrequireSession等のセッション検証ミドルウェアが一切かかっていない(pre-auth操作のため設計どおり)", async () => {
    // internalAuthRoute単体には認証ミドルウェアが存在しない(../index.tsで
    // app.route("/internal/auth", internalAuthRoute) がrequireSession登録より前に
    // マウントされている)。これはAU-5(非公開デプロイ)が唯一の防御であることの
    // 直接証拠であり、worker-apiが誤って公開された場合(AU-5違反)は
    // /internal/auth/signup等が無条件で外部到達可能になる、という多層防御の
    // 欠如(single point of failure)を明示する。
    const res = await callWorkerApi(
      new Request("http://worker-api.internal/internal/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 意図的に不正なペイロードを送り、認証エラー(401/403)ではなく
        // バリデーションエラー(400)が返ることを確認する: 401/403ならセッション/
        // 共有シークレットによる防御が存在することになるが、実際には
        // 存在しないことを示す。
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });

  it("internalAuthRouteはHonoの独立したサブアプリであり、それ自体に共有シークレット検証コードを持たない(静的確認)", () => {
    // internalAuthRoute(Honoインスタンス)にミドルウェアとして登録されている
    // ルート数と、定義済みハンドラ数が一致する=前段ミドルウェア(認証等)が
    // 挿し込まれていないことを構造的に確認する。
    const routes = internalAuthRoute.routes.map((r) => `${r.method} ${r.path}`);
    expect(routes).toEqual(
      expect.arrayContaining([
        "POST /verify-credentials",
        "POST /oauth-upsert",
        "POST /signup",
        "POST /reset-request",
        "POST /reset-confirm",
      ]),
    );
    // 全ルートがPOSTのみ・パスもハンドラ用のみ(認証チェック専用のGET/ミドルウェア
    // ルートが存在しない)ことを確認する。
    expect(routes.every((r) => r.startsWith("POST "))).toBe(true);
  });
});
