import { defineConfig } from "vitest/config";

/**
 * workers/** 専用設定。Miniflare(workerd)で実Workerプロセスを起動して検証する
 * ため、通常の `npm run test`(jsdom環境、vitest.config.ts)からは分離する。
 * T-501: service binding経由でworker-appからworker-apiのhealthを叩く検証。
 * 実行: npm run test:workers
 */
export default defineConfig({
  test: {
    include: ["workers/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
