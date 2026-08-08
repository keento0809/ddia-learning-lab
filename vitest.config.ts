import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

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
    // next-intl/next-authはデフォルトでNode ESM経由で外部化されVite側の
    // resolve.aliasが適用されないため、inline化してエイリアス解決の対象に含める。
    // next-authの追加はT-106(app/[locale]/learn/[module]/quiz/page.tsxを直接
    // importするテストがlib/auth/config.ts経由でnext-authを読み込み、
    // next-auth/lib/env.jsの`import { NextRequest } from "next/server"`が
    // 上記aliasの対象にならず解決失敗していたため追加)/T-105
    // (app/[locale]/learn/**のpage.tsxがauth()を呼ぶようになったことで
    // tests/unit/*/page404.test.tsが間接的にnext-authをimportするように
    // なった)の両方で独立に必要になった。@auth/coreの追加はT-105時点で
    // vitest.integration.config.tsの既存inline指定に揃えたもの。
    server: {
      deps: {
        inline: ["next-intl", "next-auth", "@auth/core"],
      },
    },
    // tests/e2e/**はPlaywright(@playwright/test)専用のため、vitestのデフォルト
    // includeパターン(**/*.spec.*)から除外する(npm run test:e2eで実行)。
    // tests/integration は docker-compose のテスト用DBが必要なため、
    // 通常の `npm run test` からは除外する(専用DBなしでも全green)。
    // 実行は `npm run test:integration` / vitest.integration.config.ts。
    // workers/** はMiniflare(workerd)上で実Workerを起動する検証が必要なため、
    // 通常の `npm run test`(jsdom環境)からは除外する。
    // 実行は `npm run test:workers` / vitest.workers.config.ts(T-501)。
    // .claude/worktrees/** は背景セッションが並列作業に使う入れ子のgit worktree
    // (各自が独自のtests/を持つ)。configDefaults.excludeは.gitを除外するが
    // git worktreeはリポジトリ内の通常ディレクトリのため対象外にならず、
    // ルートで`npm run test`を実行すると他worktreeの作業中テストまで収集・
    // 実行してしまい、無関係な失敗でexit 1になっていた。
    // tests/security/** はT-703(docs/design/11_ADR-011セキュリティ診断計画 §3.2・§3.3)の
    // 攻撃検証テスト。docker-compose.test.ymlのDB・実ビルド成果物(next build)を要する
    // ものを含み、かつ一部は「防御が破られている」ことを示す意図的な失敗系(突破可能な
    // 項目)を含むため、`npm run test`(exit 0が絶対規則)には含めない。
    // 実行は `npm run test:security` / vitest.security.config.ts。
    exclude: [
      ...configDefaults.exclude,
      "tests/e2e/**",
      "tests/integration/**",
      "tests/security/**",
      "workers/**",
      ".claude/worktrees/**",
    ],
  },
});
