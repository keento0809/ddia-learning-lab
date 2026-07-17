# T-000 Walking Skeleton — 動作確認手順書 / 確認結果

最終更新: 2026-07-18

## 目的

02§7.1(実行エンジン)・02§5.1(i18nルーティング)・ADR-007(Cloudflareインフラ)の
統合リスクを最初期に検出するための、使い捨て前提の最小貫通実装。本番実装(T-001以降)
はここでの知見を踏まえて作り直す。

## 実装した貫通経路

- `/ja/demo`, `/en/demo`(静的ルート。T-003で本来のmiddlewareベースのロケール解決に置換)
- コンテンツ: `content/{ja,en}/demo.mdx` を `@next/mdx` でビルド時コンパイルして表示
- 演習実行エンジンの原型: `lib/runner/harness.worker.ts`(サンドボックスWorker)+
  `lib/runner/jsRunner.ts`(Promise化 + ハードタイムアウトでのterminate)
- UI文言: `messages/{ja,en}.json` + `lib/i18n/messages.ts`(next-intl本体はT-003で導入)

## 手順1: ローカル dev サーバでの確認

```
npm run dev
```

1. `http://localhost:3000/ja/demo` にアクセスし、日本語レッスンと演習UIが表示されることを確認
2. ページ内リンクで `http://localhost:3000/en/demo` に切り替わり、英語表示になることを確認
3. 演習パネルで「正解コードを読み込む」→「実行」をクリックし、3/3件のテストに **合格** することを確認
4. 「無限ループコードを読み込む」→「実行」をクリックし、**5秒以内にタイムアウト表示**になることを確認

### 確認結果(自動化ブラウザ操作: Playwright + Chromium, headlessで実施)

| シナリオ | 結果 | 実行時間 |
| -------- | ---- | -------- |
| 正解コード → 合格 | 3/3 件合格(`合格`表示) | 数ms(Worker内実行) / クリックから69ms |
| 無限ループ → タイムアウト | `タイムアウトしました(強制停止)` 表示 | クリックから3838ms(内部timeoutMs=3000 + 500msバッファ) |

いずれも受入基準「5s以内」を満たす。無限ループは同期busy-loopのためWorker内部からは
検知不能(設計書02§7.1のとおり)。メインスレッド側 `jsRunner.ts` の `worker.terminate()`
によって強制停止されることを確認した(タイムアウト後、後続の実行にも影響が残らないことを
複数回の連続実行で確認)。

## 手順2: Cloudflare Workers(wrangler preview)での確認(ADR-007 C-6)

```
npx opennextjs-cloudflare build
npx wrangler dev --port 8788
```

`/ja/demo`, `/en/demo` にアクセスし、dev サーバと同じ2シナリオを確認する。

### 確認結果

| 項目 | 結果 |
| ---- | ---- |
| `/ja/demo`, `/en/demo` の表示 | 200 OK、両言語で正しく表示 |
| 正解コード → 合格 | 3/3件合格(4ms) |
| 無限ループ → タイムアウト | タイムアウト表示、クリックから3832ms |

演習の実行・採点は完全にブラウザ側Web Worker内で行われる(ADR-007 A-01)ため、
サーバ側ランタイム(Workers/OpenNext)の違いによる挙動差は生じない。

## 発見した非互換(ADR-007 C-6 が想定していたリスクの実例)

**症状**: 当初、`content/{ja,en}/demo.mdx` を `next-mdx-remote/rsc` の `compileMDX` +
`node:fs/promises` の `readFile` でリクエスト時に読み込む実装にしていたところ、
ローカル `next dev` / `next build` では問題なく動作したが、`wrangler dev` 経由での
アクセス時にのみ以下のエラーで500になった。

```
[unenv] fs.readFile is not implemented yet!
```

**原因**: OpenNextのCloudflareアダプタは、キャッシュバックエンド(R2等)が未設定の場合、
プリレンダー済みキャッシュを利用できずリクエスト時にページを再実行する。Cloudflare
Workers上の `nodejs_compat` レイヤ(unenv)は `node:fs` の実ファイル読み込みを実装して
いない(Workersにはリクエスト時に読めるファイルシステムが存在しない)ため、
サーバコンポーネント内での `fs.readFile` 呼び出しは本番相当環境で確実に失敗する。

**対応**: `next-mdx-remote`(実行時ロード)から `@next/mdx`(webpackローダによる
**ビルド時**コンパイル、`import Content from "@/content/ja/demo.mdx"` として通常の
Reactコンポーネントを扱う)に切り替えた。これによりランタイムでの `fs` 依存が消え、
`wrangler dev` でも200が返ることを確認した(上表)。

**設計への示唆**: 02§1 で `lib/content.ts` が「MDX/YAMLローダ(**ビルド時**ロード)」と
明記されている設計判断は、今回発見した非互換を踏まえると正しい選択である。T-006では
リクエスト時の `fs` 読み込みに依存する実装(YAMLの動的パースを含む)を避け、
ビルド時にコンテンツを静的に解決する方式(例: ビルドスクリプトでJSON化してimportする、
または `@next/mdx` 相当の仕組みでYAMLも静的取り込みする)を検討する必要がある。

## test-integrity-reviewerによる自己検査で修正した点

- `harness.worker.ts` の console捕捉実装が `console as any` を使っていたため、
  レベル別に関数を割り当てる形に書き換えて `any` を排除(CLAUDE.md規則: any禁止)
- `app/layout.tsx` のページタイトルがハードコードされていたため、
  `app/{ja,en}/demo/page.tsx` の `generateMetadata` で `messages/{ja,en}.json` から
  解決する方式に変更(CLAUDE.md規則5: UI文言のハードコード禁止)

## Out of Scope として実施しなかったこと(WBS T-000定義どおり)

- DB・認証
- スタイリング(素のHTML要素のみ、装飾なし)
- 自動テスト整備(`npm run test` はテストファイルなしで正常終了する設定のみ)
- next-intlによる本格的なmiddlewareベースのロケール解決(T-003で実施)
- grader.tsの本格的なassert種別・エッジケース対応(T-107bで実施)
- 演習定義のYAML化(T-006のコンテンツパイプラインで実施。本タスクではTSに直接定義)
