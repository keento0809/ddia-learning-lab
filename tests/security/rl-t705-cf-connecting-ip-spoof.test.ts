import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * T-705(docs/security/findings.md 所見1)修正の再侵入テスト(実workerd)。
 *
 * 元の再侵入テスト(所見1発見時点)は、生ヘッダをそのまま返すだけの最小Workerで
 * 「`cf-connecting-ip`ヘッダが実workerdで一切上書きされずそのまま透過する」ことを
 * 確認するものだった。本ファイルはT-705ハードニングでこのプローブWorkerを、実際に
 * アプリが使う`lib/auth/rateLimit.ts`の`getClientIp()`をそのままバンドルして実行する
 * ものに差し替え、修正で実際に閉じた経路(`x-forwarded-for`フォールバック・非IP値の
 * 注入)が実workerd上でも防御成立に転じたことを検証する。
 *
 * 一方、`cf-connecting-ip`ヘッダそのものの信頼性(本番Cloudflareエッジが実接続元IPで
 * 必ず上書きするという保証)は、Workerアプリケーションコード側で代替できる非スプーフ
 * 可能な識別子がCloudflare Workersランタイムに存在しないため(`request.cf`はIPを含まず、
 * Rate Limiting APIバインディングの`key`は呼び出し側指定でIP自動抽出機構が無い。
 * lib/auth/rateLimit.ts getClientIpのコメント参照)、実装修正では解消できない
 * デプロイトポロジ上の性質である。`wrangler dev --local`はこの保証が成立する対象
 * (本番Cloudflareエッジ)ではないため、この一点については引き続き透過することを
 * 「既知の残存挙動」として明示的に記録する(期待値を偽って「防御成立」と主張しない)。
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

  it("防御成立(T-705修正): cf-connecting-ipが無い接続では、X-Forwarded-Forを1リクエストごとに変えてもgetClientIp()の結果は変化しない(実workerdが自ら補う接続元情報のみが使われ、X-Forwarded-Forの値は一切反映されない)", async () => {
    const resA = await fetch(`http://localhost:${port}/`, {
      headers: { "x-forwarded-for": "6.6.6.6" },
    });
    const resB = await fetch(`http://localhost:${port}/`, {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    const bodyA = (await resA.json()) as { clientIp: string };
    const bodyB = (await resB.json()) as { clientIp: string };
    expect(bodyA.clientIp).toBe(bodyB.clientIp);
    expect(bodyA.clientIp).not.toBe("6.6.6.6");
    expect(bodyA.clientIp).not.toBe("9.9.9.9");
  });

  it("防御成立(T-705修正): IPとして妥当な形をしていないcf-connecting-ip値(注入・ゴミ値)はgetClientIp()に採用されず固定値unknownを返す", async () => {
    const res = await fetch(`http://localhost:${port}/`, {
      headers: { "cf-connecting-ip": "not-an-ip; DROP TABLE users" },
    });
    const body = (await res.json()) as { clientIp: string };
    expect(body.clientIp).toBe("unknown");
  });

  it("既知の残存挙動(実装では解消不可、デプロイトポロジに依存): 形式上妥当なcf-connecting-ipは実workerdでも透過するため、getClientIp()はそのままこれを採用する。本番Cloudflareエッジはこのヘッダを実接続元IPで上書きするため到達しないが、その保証はローカル実行環境には及ばない(docs/security/findings.md 所見1)", async () => {
    const spoofedIp = "6.6.6.6";
    const res = await fetch(`http://localhost:${port}/`, {
      headers: { "cf-connecting-ip": spoofedIp },
    });
    const body = (await res.json()) as { cfConnectingIp: string | null; clientIp: string };
    expect(body.cfConnectingIp).toBe(spoofedIp);
    expect(body.clientIp).toBe(spoofedIp);
  });

  it("参考: ヘッダを一切送らない場合、getClientIp()は実workerdが接続ごとに補うcf-connecting-ip(ループバック)を返す(x-forwarded-forへのフォールバックが無いことの対照確認)", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    const body = (await res.json()) as { cfConnectingIp: string | null; clientIp: string };
    expect(body.clientIp).not.toBe("unknown");
    expect(body.clientIp).toBe(body.cfConnectingIp);
  });
});
