import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * T-705 Medium #4(docs/security/findings.md)修正の再侵入テスト(実workerd)。
 *
 * lib/auth/rateLimit.tsのgetClientIp()は`cf-connecting-ip`を最優先で信頼する。
 * 本番Cloudflareのエッジは実クライアント接続元IPでこのヘッダを必ず上書きする
 * (と一般に文書化されている)という前提のもとでは安全なはずだが、`npm run preview`
 * (実workerd)自体がこの前提を満たすローカル環境かどうかは別問題である。
 *
 * `npm run preview`(opennextjs-cloudflare preview)はローカルに`.env`が存在すると
 * `scripts/check-no-local-env-for-worker-build.mjs`(T-705の別修正)がビルドを
 * 停止するため、アプリ本体を経由した実機検証が困難な場合がある。本テストは
 * アプリのビルドを経由せず、本プロジェクトが依存する実wrangler(package.jsonの
 * devDependenciesと同一バージョン)でリクエストヘッダをそのまま返す最小Workerを
 * `wrangler dev --local`(実workerd)で起動し、`cf-connecting-ip`ヘッダが
 * クライアント側から上書きされずに透過することを直接確認する。これはNext.js/
 * OpenNextアダプタ層のコードとは独立したworkerdローカルシミュレータ自体の
 * 仕様であるため、アプリ本体でも同様に再現すると判断できる(docs/security/
 * findings.md 所見1参照)。
 */
describe("T-705再侵入テスト(実workerd): cf-connecting-ipヘッダのクライアント偽装可能性", () => {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const fixtureDir = path.join(process.cwd(), "tests/security/fixtures/cf-header-probe");
  const wranglerBin = path.join(process.cwd(), "node_modules/.bin/wrangler");
  let child: ChildProcess;

  async function waitForReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://localhost:${port}/`);
        if (res.ok) return;
      } catch {
        // まだ起動していない。
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`実workerd(wrangler dev --local, port=${port})が起動しなかった`);
  }

  beforeAll(async () => {
    child = spawn(
      wranglerBin,
      ["dev", "--config", path.join(fixtureDir, "wrangler.toml"), "--port", String(port), "--local"],
      { cwd: fixtureDir, stdio: "ignore" },
    );
    await waitForReady(60_000);
  }, 90_000);

  afterAll(() => {
    child?.kill();
  });

  it("突破: クライアントが送ったcf-connecting-ipが実workerdで一切上書きされずそのまま透過する", async () => {
    const spoofedIp = "6.6.6.6";
    const res = await fetch(`http://localhost:${port}/`, {
      headers: { "cf-connecting-ip": spoofedIp },
    });
    const body = (await res.json()) as { cfConnectingIp: string | null };
    // 本番Cloudflareエッジであればここは実クライアントIPへ上書きされ、spoofedIpとは
    // 一致しないはずである。実workerd(wrangler dev --local)ではその上書きが
    // 行われないため、getClientIp()が最優先で信頼するこのヘッダ自体が
    // クライアント制御下にあることになる。
    expect(body.cfConnectingIp).toBe(spoofedIp);
  });

  it("参考: cf-connecting-ipを送らない場合はループバックアドレスが入る(ヘッダ自体は存在する)", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    const body = (await res.json()) as { cfConnectingIp: string | null };
    expect(body.cfConnectingIp).not.toBeNull();
    expect(body.cfConnectingIp).not.toBe("6.6.6.6");
  });
});
