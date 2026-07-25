# 統合テストの書式と検証ループ

2種類の統合テストがあり、目的が異なる。両方の使い分けを理解してから
書くこと(片方で足りると誤解しない)。

## 1. Node環境インプロセステスト: `tests/integration/*.integration.test.ts`

- 実行: `npm run test:integration`
  (`scripts/test-integration.sh` がdocker-compose.test.ymlでテスト用
  Postgresを起動→`prisma migrate deploy`→
  `vitest run -c vitest.integration.config.ts`→コンテナ後始末)
- 目的: ビジネスロジック(バリデーション/slug照合/単調性/ストリーク/CSRF等)
  の検証。Cloudflare実行環境やservice bindingは介さない。
- 雛形: `tests/integration/progress.flow.integration.test.ts`。

要点:
```ts
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
const { auth } = await import("@/lib/auth/config");
const { GET, PUT } = await import("@/app/api/progress/route");
// mockedAuth.mockResolvedValue({ user: { id: userId }, expires: ... }) で
// 固定ユーザーのセッションとして扱う
```

worker-api(Hono)側のロジックを直接テストしたい場合は、`workers/api/src/index.ts`
のHonoアプリを`app.request(...)`や`app.fetch(...)`でインプロセス呼び出しする形で
同様のテストを書ける(service bindingやMiniflareは不要)。

02§3の仕様表がある機能では「1ケース=1テスト」で以下を最低限網羅する:
- 正常系(200/201)
- 400(バリデーション失敗)
- 401(未認証)
- 409(slug_unknownなど状態競合、該当する場合)
- 冪等性/単調性などドメイン固有の性質(該当する場合)

## 2. Miniflare実バンドルテスト: `workers/api/tests/*.test.ts`

- 実行: `npm run test:workers`
  (`scripts/test-workers.sh`が同様にテスト用Postgresを起動してから
  `vitest run -c vitest.workers.config.ts`)
- 目的: `wrangler deploy --dry-run`で実バンドルしたworker-apiを
  Miniflare(workerd)上で起動し、service binding経由の実到達性・
  JWT検証・実DB接続(Prisma workerdランタイム)そのものを検証する。
  Node環境テストでは検証できない「実Workers環境で本当に動くか」が対象。
- 雛形: `workers/api/tests/apiRoutes.test.ts`。既存の`describe`ブロックに
  新規ルートの`it`を追加する形が最も手数が少ない。

要点(`beforeAll`で毎回やること):
```ts
outDir = mkdtempSync(...);
execFileSync("npx", ["wrangler", "deploy", "--dry-run",
  "--config", "workers/api/wrangler.jsonc", "--outdir", outDir], ...);
mf = new Miniflare({ workers: [
  { name: "worker-app-stub", modules: [...], serviceBindings: { API: "ddia-learning-lab-api" } },
  { name: "ddia-learning-lab-api", modules: true, scriptPath: path.join(outDir, "index.js"),
    modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }], // Prismaのquery compiler WASM用
    bindings: { AUTH_SECRET, DATABASE_URL } },
] });
```

DB検証には生の`pg`クライアントを使う(Prisma生成クライアントを
このテストファイル自身がトップレベルimportすると、workerd専用の
`import("*.wasm?module")`をVitestのVite変換が解析エラーにするため)。

失敗→恒久対策として既に判明している既知の落とし穴(自分で再発見しなくてよい):
同一Miniflareインスタンス内でPrismaClient/pg接続をリクエストを跨いで
キャッシュすると、Cloudflare Workersのリクエスト単位I/O分離と衝突し
"detected that your Worker's code had hung" で確実にハングする。
worker-api側は**リクエストごとに新規PrismaClientを生成し、
レスポンス確定後に必ず`$disconnect()`する**設計(`workers/api/src/db.ts`,
`workers/api/src/index.ts`のミドルウェア)になっている。この設計を
崩さない(グローバルシングルトンキャッシュを持ち込まない)。

## 検証ループ

1. 該当コマンド(`npm run test` / `npm run test:integration` /
   `npm run test:workers`)を実行し、出力を会話に**必ず表示**する。
2. 失敗したら原因を特定して修正する。テストのexpectを緩めたり、
   `skip`/`only`を入れたり、timeoutを延長して誤魔化すことは禁止
   (CLAUDE.md絶対規則4、test-integrity-reviewerの対象)。
3. 緑になるまで1に戻る。部分的に緑な状態で完了報告しない。
