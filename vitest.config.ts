import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // T-005で.tsxコンポーネントを直接呼び出すテスト(tests/unit/auth/oauthButtons.test.tsx)を
  // 初めて追加した際、Viteのデフォルト(esbuildのclassic変換)でコンパイルされ
  // 「React is not defined」で失敗した(Next.js本体はSWCでautomatic runtimeを使うため
  // これまで顕在化していなかった)。Next.jsと同じautomatic runtimeに揃える。
  esbuild: {
    jsx: "automatic",
  },
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
    // tests/integration は docker-compose のテスト用DBが必要なため、
    // 通常の `npm run test` からは除外する(専用DBなしでも全green)。
    // 実行は `npm run test:integration` / vitest.integration.config.ts。
    exclude: ["node_modules/**", "tests/integration/**"],
  },
});
