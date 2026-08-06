import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * tests/security/** 専用設定(T-703、docs/design/11_ADR-011セキュリティ診断計画
 * §3.2 AU-1〜9・§3.3 IJ-1〜5)。docker-compose.test.ymlのDBを要するテストと、
 * 実ビルド成果物(`next build`の.next/static)を検査するテストの両方を含むため
 * vitest.integration.config.tsと同じPrisma workerdエイリアス・next/serverエイリアス・
 * setupFiles(tests/integration/setup.ts、dispatchToWorkerApi/workerApiAuthを
 * worker-api本体へインプロセス委譲するモック)を再利用する。
 * 実行: npm run test:security(scripts/test-security.shがDB起動〜生成〜teardownまで担う)
 *
 * このtierに含まれるテストの一部は意図的に「防御が破られている」ことを示す
 * 期待値(セキュアな挙動を期待するassert)を書いており、現状の実装に対しては
 * 失敗(red)する。これはCLAUDE.md規則4(テストを弱めて通すことの禁止)に従い、
 * T-705での修正後にgreenへ転じる回帰テストとして機能させるための意図的な設計
 * (ADR-010 §6「攻撃テストコード自体は防御の回帰テストとして価値がある」)であり、
 * `npm run test`(exit 0が絶対規則)には含めない。
 */
export default defineConfig({
  // vitest.config.tsと同じ理由(ij2-reflected-xss.test.tsxがJSXを直接使うため、
  // Next.jsと同じautomatic runtimeに揃える)。
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      {
        find: /^@\/lib\/generated\/prisma-workerd\/(.*)$/,
        replacement: fileURLToPath(new URL("./lib/generated/prisma/$1", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL(".", import.meta.url)) },
      {
        find: "next/server",
        replacement: fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["tests/security/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/integration/setup.ts"],
    // AU-9の実ビルド検証(next build)は数十秒〜数分かかるため長めに設定する。
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // tests/integration/**と同じ理由(同一テスト用Postgresを共有するため直列実行)。
    fileParallelism: false,
    server: {
      deps: {
        inline: ["next-intl", "next-auth", "@auth/core"],
      },
    },
  },
});
