import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * tests/integration/** 専用設定。docker-compose.test.yml のDBが必要。
 * 実行: npm run test:integration (scripts/test-integration.sh がDB起動〜migrate〜teardownまで担う)
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // T-003決定事項ログと同種の問題(next-authも拡張子なしで"next/server"を
      // importするため、Node ESM解決が失敗する)。vitest.config.tsと同じ回避策。
      "next/server": fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
    },
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
