import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // next-intlのmiddleware実装が拡張子なしで"next/server"をimportするが、
      // nextパッケージにexportsフィールドが無くVite(Rollup)側の厳密なESM解決が
      // 失敗するため、実ファイルへ明示的にエイリアスする。
      "next/server": fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
    },
  },
  test: {
    // next-intlはデフォルトでNode ESM経由で外部化されVite側のresolve.aliasが
    // 適用されないため、inline化してエイリアス解決の対象に含める。
    server: {
      deps: {
        inline: ["next-intl"],
      },
    },
    // tests/e2e/**はPlaywright(@playwright/test)専用のため、vitestのデフォルト
    // includeパターン(**/*.spec.*)から除外する(npm run test:e2eで実行)。
    // tests/integration は docker-compose のテスト用DBが必要なため、
    // 通常の `npm run test` からは除外する(専用DBなしでも全green)。
    // 実行は `npm run test:integration` / vitest.integration.config.ts。
    exclude: [...configDefaults.exclude, "tests/e2e/**", "tests/integration/**"],
  },
});
