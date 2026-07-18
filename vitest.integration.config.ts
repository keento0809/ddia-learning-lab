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
    },
  },
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
  },
});
