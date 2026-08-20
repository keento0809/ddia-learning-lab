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
// PR#141(アバター機能)がimg-src更新を伴わずに追加したOAuthプロフィール画像
// への依存を追加許可する(app/[locale]/layout.tsx: session.user.imageは
// Auth.js既定のGoogle/GitHub providerがそれぞれのprofile.picture/avatar_urlを
// そのまま渡す。components/layout/AccountMenu.tsx参照)。
// GoogleのOAuthプロフィール画像は`lh3.googleusercontent.com`が実体だが、
// Googleアカウント設定変更等でサブドメインが変わりうるため`*.googleusercontent.com`
// をワイルドカード許可する。ただしこのホストはGoogle Photos/Drive公開共有等
// 任意ユーザーコンテンツも同じドメイン配下でホストされ得るため、img-src以外
// (script-src/connect-src等)には決して広げないこと。
//
// 既知の残存リスク(未解消、要フォローアップ): tests/security/csp-t704-repentest.test.ts
// が指摘する通り、DOMPurify(lib/notes/renderNoteMarkdown.ts、ノート機能T-307)は
// インラインstyle属性のurl()を除去しない(本タスクでjsdom+dompurify、かつ
// marked.parse→DOMPurify.sanitizeの実パイプラインを再現してprobe済み:
// `<style>...</style>`要素は既定の`FORBID_CONTENTS`(node_modules/dompurify/
// dist/purify.min.jsのデフォルト設定に'style'を含む、README.mdのFORBID_CONTENTS
// 節参照)によりコンテンツごと除去される一方、`style="background:url(...)"`
// 属性は`ALLOWED_ATTR`に'style'が含まれるため通過することを確認した)。
// これまでimg-srcが'self' data:のみだったためCSPが別レイヤーで
// ブロックしていたが、今回`*.googleusercontent.com`を許可したことで、ノート内に
// このホストを指すurl()を仕込まれた場合に画像リクエスト(=閲覧トラッキング
// ビーコン)が成立する経路が理論上再び開く。
// 重大度メモ: lib/notes/api.ts・app/api/[...path]/route.tsの実装は他の
// progress/submissions/account系エンドポイントと同じセッションuserId
// スコープパターンであり、ノートは自分専用(他ユーザーの閲覧・共有・
// エクスポート導線は本リポジトリに現状存在しない)ため、悪用しても
// 攻撃者自身に対するビーコンにしかならず実害は限定的と判断した。
// 恒久対策(本タスクのスコープ外、lib/notes/renderNoteMarkdown.tsの変更が
// 必要なため未実施): DOMPurifyの設定でstyle属性内のurl()、または
// style属性自体をFORBID_ATTRで除去する。ノート共有/エクスポート機能を
// 追加する場合は着手前に必須で対応すること。
const GOOGLE_AVATAR_ORIGIN = "https://*.googleusercontent.com";
const GITHUB_AVATAR_ORIGIN = "https://avatars.githubusercontent.com";

export function buildMainPageCsp(): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", JSDELIVR_ORIGIN]],
    ["style-src", ["'self'", "'unsafe-inline'", JSDELIVR_ORIGIN]],
    ["font-src", ["'self'", "data:", JSDELIVR_ORIGIN]],
    ["img-src", ["'self'", "data:", GOOGLE_AVATAR_ORIGIN, GITHUB_AVATAR_ORIGIN]],
    ["connect-src", ["'self'", JSDELIVR_ORIGIN, SENTRY_INGEST_ORIGIN]],
    ["worker-src", ["'self'", "blob:", JSDELIVR_ORIGIN]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives.map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ");
}
