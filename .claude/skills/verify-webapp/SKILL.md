---
name: verify-webapp
description: UI・画面・可視化・演習機能の変更を完了と報告する前に、end-to-endで検証する手順。編集が成功しただけで完了と報告してはならない。
---

# Webアプリ変更の検証手順

UI変更を「エディタ上で編集が成功した」だけで完了と報告してはならない。
人間のレビュアーが行うのと同じ方法で検証する:

1. **受入コマンドを実行し、出力を会話に表示する**(サイレント実行禁止):
   `npm run lint && npm run typecheck && npm run test`
   コンテンツを触った場合は `npm run validate:content` も実行する。

2. **`next dev`(`npm run dev`)ではなく `npm run preview` でサーバを起動し、変更したページを実際に開く。**
   **失敗→恒久対策(2026-07-31確認)**: `next dev`は`getCloudflareContext`が使う
   `getPlatformProxy`のservice bindingローカルスタブが`Request`オブジェクトを
   受け付けず(URL文字列のみ許容と推定)、`env.API.fetch(request)`を呼ぶ全ルート
   (`lib/api/workerApiDispatch.ts`・`lib/auth/workerApiAuth.ts`経由の
   `/api/*`——認証・dashboard・progress・submissions・guest-progress/import・
   account等)が`TypeError: Failed to parse URL from [object Request]`で無条件に
   500を返す(worker-apiを別途起動して接続済みにしても再現する。実workerd
   `wrangler dev`/`opennextjs-cloudflare preview`/本番では同じアプリコードが
   正しく動作することを確認済み — アプリのバグではなく`next dev`側の制約)。
   - 起動: `npm run preview`(`opennextjs-cloudflare build && opennextjs-cloudflare preview`、
     http://localhost:8787)。ビルド成果物を使うため、コード変更のたびに再実行が必要
     (next devのような自動リロードはない)。
   - 検証対象が`/api/*`(認証・dashboard・progress・submissions・
     guest-progress/import・account)を経由する変更の場合は、別プロセスで
     worker-apiも起動しておくこと: `(cd workers/api && npx wrangler dev)`
     (http://localhost:8788)。ローカルのdev registry経由でservice bindingが
     接続される。未起動のまま`npm run preview`だけで叩くと
     `503 Worker "ddia-learning-lab-api" not found`になるが、これはworker-api
     未起動という前提条件の問題であり本項のバグとは別(期待通りの挙動)。
   - `next dev`はページのSSR自体(`/ja`・`/en`等の直接アクセス)は200を返すため、
     `/api/*`を経由しない純粋なUI変更ではエラーに気づけない。`/api/*`を経由するか
     不明な場合は安全側に倒して`npm run preview`で検証すること。
   - 対象ルートは /ja と /en の両方を開くこと。

3. **変更点を直接操作する。** 新しいコントロール(ボタン、エディタ、Viz操作)なら:
   クリック/入力し、期待する状態変化を確認する。操作前後の状態を
   テキストで記録する(スクリーンショットが取れる環境なら取得する)。

4. **言語切替を変更点の操作の途中で行い、状態が保持されることを確認する**
   (エディタ内容・実行結果・スクロール位置。docs/design/02 §5.1 の要件)。

5. **ブラウザconsoleを確認する: 新規のエラー・警告がゼロであること。**

6. 演習(ラボ)関連の変更なら: 模範解答コードで pass、
   `while(true){}` で5.5秒以内に timeout が返ることを確認する。

7. いずれかのステップが失敗したら、修正してステップ1からやり直す。
   **部分的に検証済みの状態で完了報告をしてはならない。**

検証結果は完了報告の「受入基準との対応表」に、実施したステップと
観察結果を添えて記載する。
