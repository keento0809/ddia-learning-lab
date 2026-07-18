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
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
