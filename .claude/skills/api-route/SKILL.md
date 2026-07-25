---
name: api-route
description: DDIA Learning Labで新しいAPIエンドポイント/Route Handlerを作成・修正するときに必ず使う。「APIルートを作って」「PUT /api/xxxを実装して」「〜のエンドポイントを追加して」「このAPIにバリデーションを足して」のような依頼で発火する。zodコントラクト(lib/contracts)の参照・不足時の停止判断、RFC 9457 Problem Detailsでのエラー返却、ビルド時slugマニフェストとの照合、ADR-008の2 Worker構成(worker-app/worker-api)のどちらに実装するかの判断、統合テストの雛形作成から検証ループ(実行→修正→再実行)までを一貫して行う。
---

# API Route 実装スキル

DDIA Learning Lab(docs/design/02_詳細設計書.md §3, docs/design/09_ADR-008)の
APIエンドポイントを実装するための手順。すべてのAPIはzodコントラクト・
RFC 9457エラー・slugマニフェスト照合という共通契約に従う必要があり、この
スキルはその契約を毎回組み立て直すのではなく、既存の実装(progress/
submissions/dashboard等)と同じ形に揃えるためのものである。

## 前提: CLAUDE.mdの絶対規則がこのスキルより優先する

- `lib/contracts/` 配下の型・スキーマは変更禁止。必要なリクエスト/レスポンス
  スキーマが存在しない場合、**このスキルの手順を止めて**「依存契約が未定義」
  と報告し、ユーザーの指示を待つ。契約を推測で追加しない。
- モック・スタブ・TODOで「実装したことにする」ことは禁止。統合テストが
  実DB(docker-compose.test.yml)を要求する場合、それを回避する簡略化を
  行わない。
- タスクのOut of Scope外の既存ハンドラへの無関係なリファクタは行わない。

## 手順

### 1. コントラクトを確認する

`lib/contracts/api.ts`(必要なら`lib/contracts/manifest.ts`
`lib/contracts/common.ts`)を読み、実装しようとしているエンドポイントの
リクエスト/レスポンススキーマが**既に定義されているか**を確認する。

- 定義済み → そのスキーマ・型をそのままimportして使う(2で判断・3で実装)。
- 未定義 → 前提のとおり停止して報告する。このスキルは契約を新設しない。

### 2. どちらのWorkerに実装するかを判断する

ADR-008(2 Worker構成)により、実装先はエンドポイントの性質で決まる。
判断基準の詳細と却下パターンは `references/worker-decision.md` を読むこと。
要点だけ先に示す:

| 実装先 | 対象 | 場所 |
|---|---|---|
| **worker-api**(Hono) | Prisma/DBアクセスを伴う一般API(進捗・提出・ダッシュボード等) | `workers/api/src/routes/*.ts` |
| **worker-app**(Next.js Route Handler) | Auth.js自体のルート(`/api/auth/*`)、Prismaに依存しない認証周りのみ | `app/api/auth/**` |

迷ったら「Prismaで直接DBを読み書きするか」で判断する。読み書きするなら
worker-api一択(worker-appはADR-008でPrisma依存を除去済み)。

新規の非authパス(`/api/*`)は `app/api/[...path]/route.ts` の
catch-allフォワーダが自動的にworker-apiへservice binding経由で転送するため、
**Next.js側に専用Route Handlerを新設する必要はない**(既存の
`app/api/progress/route.ts`等は移設前からの専用ハンドラが残っているだけで、
新規実装では不要)。

### 3. Route Handler / Honoルートを実装する

worker-api(Hono)に実装する場合:

1. `workers/api/src/routes/<name>.ts` を作成する。既存の
   `workers/api/src/routes/progress.ts` を雛形にする:
   - `Hono<{ Bindings: Bindings; Variables: Variables }>` でルータを作る
     (`Variables = { userId: string; prisma: PrismaClient }`)
   - 認証必須なら `workers/api/src/index.ts` 側で
     `app.use("/api/<path>", requireSession)` を追加してから
     `app.route("/api/<path>", <name>Route)` でマウントする
   - 状態変更系(PUT/POST/PATCH/DELETE)はCSRF検証
     (`../csrf.ts` の `verifyCsrfToken`)を先頭で行う
   - リクエストボディは `c.req.json()` を try/catch し、zodの
     `safeParse` で検証する
2. エラーは必ず `../problem.ts` の `problemResponse(c, status, type, title, detail?)`
   で返す。RFC 9457のtype/title文字列の付け方は
   `references/error-handling.md` を参照する。
3. `itemSlug` のような、ビルド時slugマニフェストに対して照合が必要な入力は
   `references/slug-manifest.md` の手順で `isKnownSlug` を使い、
   未知slugは409(`slug_unknown`)にする。

worker-app(認証ルート)に実装する場合は `app/api/auth/signup/route.ts` を
雛形にし、エラーは `lib/auth/http.ts` の `problemResponse(status, type, title, detail?)`
(Hono版と引数順序が異なることに注意)を使う。

### 4. 統合テストを書く

`references/integration-test.md` に、Node環境(vitestインプロセス、
`tests/integration/`)とMiniflare/workerd実バンドル(`workers/api/tests/`)
の2種類のテスト雛形と使い分けがある。新規worker-apiルートは原則
**両方**用意する: ロジック検証はNode環境、service binding越しの実到達性は
Miniflareの方でカバーする(既存の`apiRoutes.test.ts`にケースを追加する形で
十分なことが多い)。

02§3の仕様表がある機能は「1ケース=1テスト」で正常系・400・401・409等の
代表的な異常系を網羅する(`progress.flow.integration.test.ts`が参考例)。

### 5. 検証ループ

実装して終わりにしない。以下を実行し、**出力を必ず会話に表示する**
(CLAUDE.md絶対規則11、サイレント実行禁止):

```
npm run lint
npm run typecheck
npm run test              # Node環境の単体/インプロセステスト
npm run test:integration  # tests/integration/**(実DB要、docker-compose.test.yml起動)
npm run test:workers      # workers/api/tests/**(Miniflare実バンドル、実DB要)
```

失敗したら原因を特定して修正し、該当コマンドから再実行する。テストを
弱めて(expect緩和・skip・timeout延長)通すことは禁止(CLAUDE.md絶対規則4)。
全て緑になるまでこのステップを繰り返す。

新規/変更したエンドポイントがサイズ予算(ADR-008 §3)に影響し得る依存を
追加した場合は `npm run check:bundle-size` も実行して結果を確認する。

### 6. 完了報告

CLAUDE.mdの完了報告フォーマット(実装サマリ/変更ファイル一覧/受入基準対応表/
実行コマンドの生ログ/スコープ外事項/設計との差異)に従って報告する。
受入基準との対応表には、このスキルで実行した検証コマンドとその結果を
1行ずつ対応させる。
