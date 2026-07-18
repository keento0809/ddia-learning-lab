import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // tests/integration は docker-compose のテスト用DBが必要なため、
    // 通常の `npm run test` からは除外する(専用DBなしでも全green)。
    // 実行は `npm run test:integration` / vitest.integration.config.ts。
    exclude: ["node_modules/**", "tests/integration/**"],
  },
});
