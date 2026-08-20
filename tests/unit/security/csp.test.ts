import { describe, expect, it } from "vitest";
import { buildMainPageCsp } from "@/lib/security/csp";

/**
 * T-704(ADR-010 §3.4 CF-1): メインページ向けCSP(演習実行Workerとは別ポリシー、
 * middleware.tsが全ページに付与)。
 *
 * script-srcの'unsafe-inline'は実ブラウザ検証(npm run preview + Playwright)で
 * 判明した制約(Next.js App RouterのRSCストリーミングが内容非決定的な
 * インラインスクリプトをページごとに複数注入するため、sha256ハッシュでの
 * 個別allowlistが不可能。nonce方式はSSGページを強制的に動的レンダリングへ
 * 切り替えるためスコープ外)による既知の残存リスクであり、lib/security/csp.ts
 * のコメントに理由を記録済み。このテストではその制約の下でも他のホスト
 * 制限(演習実行Workerとは無関係な外部ホストを許可していないこと)が
 * 維持されていることを固定する。
 */
describe("buildMainPageCsp", () => {
  it("script-srcに'unsafe-eval'を含めない(evalは許可しない)", () => {
    const csp = buildMainPageCsp();
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("script-srcのホストは'self'とMonaco既定CDN(jsDelivr)のみに限定する(任意外部ホスト不可)", () => {
    const csp = buildMainPageCsp();
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    const sources = scriptSrc.split(" ").slice(1);
    expect(sources.sort()).toEqual(["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"].sort());
  });

  it("connect-src/worker-srcはワイルドカード全許可('*')を含まない", () => {
    const csp = buildMainPageCsp();
    for (const directive of ["connect-src", "worker-src"]) {
      const clause = csp.split("; ").find((d) => d.startsWith(directive));
      expect(clause, `${directive}が見つからない`).toBeDefined();
      expect(clause!.split(" ")).not.toContain("*");
    }
  });

  it("Monaco既定CDN(jsDelivr)をscript-src/style-src/connect-src/worker-srcに許可する", () => {
    const csp = buildMainPageCsp();
    for (const directive of ["script-src", "style-src", "connect-src", "worker-src"]) {
      const clause = csp.split("; ").find((d) => d.startsWith(directive));
      expect(clause, `${directive}が見つからない`).toContain("https://cdn.jsdelivr.net");
    }
  });

  /**
   * PR#141(アバター機能)がimg-src更新を伴わずにOAuthプロバイダの画像ホスト
   * (Google/GitHub)への依存を追加し、実ブラウザでCSPブロック(壊れた画像
   * アイコン表示)が発生していた回帰の再発防止テスト
   * (components/layout/AccountMenu.tsx参照)。
   */
  it("img-srcはOAuthプロバイダのアバター画像ホスト(Google/GitHub)を許可する", () => {
    const csp = buildMainPageCsp();
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src"))!;
    expect(imgSrc).toContain("https://*.googleusercontent.com");
    expect(imgSrc).toContain("https://avatars.githubusercontent.com");
  });

  it("img-srcのホストは'self'・data:・許可済みOAuthアバターホストのみに限定する(任意外部ホスト不可)", () => {
    const csp = buildMainPageCsp();
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src"))!;
    const sources = imgSrc.split(" ").slice(1);
    expect(sources.sort()).toEqual(
      [
        "'self'",
        "data:",
        "https://*.googleusercontent.com",
        "https://avatars.githubusercontent.com",
      ].sort(),
    );
  });

  it("object-src/base-uri/frame-ancestorsは'none'で固定する", () => {
    const csp = buildMainPageCsp();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("呼び出すたびに同一のCSP文字列を返す(決定的)", () => {
    const a = buildMainPageCsp();
    const b = buildMainPageCsp();
    expect(a).toBe(b);
  });
});
