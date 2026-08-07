/**
 * メインページ(SSR/SSG両方の通常ページ)向けCSP(T-704、ADR-010 §3.4 CF-1)。
 * 演習実行Worker(harness.worker.ts等)向けの厳格なallowlist CSPとは別ポリシー
 * (scripts/generate-worker-csp-headers.mjsが`_headers`経由で適用、こちらは
 * middleware.tsがレスポンスヘッダとして付与)。
 *
 * `@monaco-editor/react`は既定でMonaco本体をjsDelivr CDN(`cdn.jsdelivr.net`)から
 * 遅延取得し(monaco-editorをnpm依存に追加していない、components/lab/CodeEditor.tsx参照)、
 * AMDローダ経由でCSS/フォント/言語ワーカーもそこから取得する。そのため
 * script-src/style-src/font-src/connect-src/worker-srcにこのオリジンを許可する
 * (実ブラウザでCSP違反ゼロを確認: npm run preview + Playwright、findings.md参照)。
 *
 * script-srcに`'unsafe-inline'`を残す理由(残存リスク、正直に記録): 当初
 * テーマ切替FOUC防止スクリプト(buildThemeBootstrapScript())のみをsha256
 * ハッシュでallowlistする設計を試みたが、実ブラウザ検証(npm run preview +
 * Playwright)でNext.js App Router自身がRSC(React Server Components)の
 * ストリーミングペイロードをページごとに複数のインラインスクリプト
 * (`self.__next_f.push(...)`、内容はページのデータに依存し決定的にハッシュ
 * 列挙できない)として注入していることが判明し、5件のCSP違反(スクリプト
 * ブロック)が実際に発生した。Next公式のnonceベース対応
 * (https://nextjs.org/docs/app/guides/content-security-policy)は有効だが、
 * リクエストごとに異なるnonceをHTMLへ埋め込む必要があるためNext.jsの
 * 静的生成(SSG、現在複数ページが該当)を全ページ動的レンダリングへ強制的に
 * 切り替える(Next公式ドキュメントにも明記された既知のトレードオフ)。
 * これはCSPヘッダ付与という本タスクのスコープを超えるレンダリング方式の
 * アーキテクチャ変更であり、CLAUDE.md絶対規則1(指示されたスコープのみ実装)
 * に反するため見送り、script-srcの`'unsafe-inline'`許容を選択した
 * (それでもscript-srcのホスト自体は'self'+jsDelivrのみに絞られており、
 * 任意外部ホストからのスクリプト読み込みは引き続き拒否される。演習実行
 * Worker側のCSPはこの制約と無関係で、`'unsafe-inline'`を一切含まない)。
 */
const JSDELIVR_ORIGIN = "https://cdn.jsdelivr.net";
// T-505: ブラウザ側Sentry(@sentry/browser、lib/sentry/client.ts)。DSN未設定時は
// Sentry.init自体が呼ばれずリクエストも発生しないため許可しても実害はないが、
// 最小権限のため許可先はSentryのingestエンドポイントのみに限定する。
const SENTRY_INGEST_ORIGIN = "https://*.sentry.io";

export function buildMainPageCsp(): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", JSDELIVR_ORIGIN]],
    ["style-src", ["'self'", "'unsafe-inline'", JSDELIVR_ORIGIN]],
    ["font-src", ["'self'", "data:", JSDELIVR_ORIGIN]],
    ["img-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", JSDELIVR_ORIGIN, SENTRY_INGEST_ORIGIN]],
    ["worker-src", ["'self'", "blob:", JSDELIVR_ORIGIN]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives.map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ");
}
