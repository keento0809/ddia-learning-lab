import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * tests/integration/** 専用設定。docker-compose.test.yml のDBが必要。
 * 実行: npm run test:integration (scripts/test-integration.sh がDB起動〜migrate〜teardownまで担う)
 */
export default defineConfig({
  resolve: {
    alias: [
      // 失敗→恒久対策(T-502): tests/integration/*はworkers/api/src/index.ts
      // (dispatchToWorkerApiのモック経由)をNode上でインプロセス実行して検証する。
      // workers/api専用のPrismaクライアント(lib/generated/prisma-workerd、
      // schema.prismaのgenerator clientWorkerd)はCloudflare Workers(workerd)専用の
      // `import("*.wasm?module")` 規約でquery compiler WASMを読み込むため、Vite/Node
      // 環境では静的解析の時点で失敗する(実行前のtransformエラー)。ビジネスロジック
      // 検証が目的でありWASM読み込み機構自体はworkers/api/tests/(Miniflare実行)で
      // 別途検証済みのため、テスト実行時のみ通常のNode向けクライアント
      // (lib/generated/prisma、同一schema.prismaから生成・スキーマ/クエリAPIは同一)へ
      // 差し替える。汎用の"@"エイリアスより先に評価させるため配列の先頭に置く
      // (Viteのaliasは配列の先頭から順に最初に一致したものを使う)。
      {
        find: /^@\/lib\/generated\/prisma-workerd\/(.*)$/,
        replacement: fileURLToPath(new URL("./lib/generated/prisma/$1", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL(".", import.meta.url)) },
      // T-003決定事項ログと同種の問題(next-authも拡張子なしで"next/server"を
      // importするため、Node ESM解決が失敗する)。vitest.config.tsと同じ回避策。
      {
        find: "next/server",
        replacement: fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    // 全ファイルが同一のテスト用Postgres(docker-compose.test.yml)を共有するため、
    // ファイル並列実行だとbeforeEachの全件deleteMany(db.crud.integration.test.ts等)が
    // 他ファイルの実行中データを消し飛ばし、外部キー制約違反等で不安定化する
    // (T-104でtests/integration/progress.flow.integration.test.tsを追加した際に発覚)。
    // 恒久対策としてファイルを直列実行する。
    fileParallelism: false,
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
