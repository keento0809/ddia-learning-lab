import { FlatCompat } from "@eslint/eslintrc";
import reactPlugin from "eslint-plugin-react";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      // 恒久対策: `.wrangler/**`はリポジトリ直下の.wranglerしか一致せず、
      // `workers/api/.wrangler/tmp/**`のようなネストした.wranglerディレクトリ
      // (wrangler dev実行中にのみ生成される一時ビルド成果物。.gitignore済み)
      // には一致しないため、`**/`を付けてどの深さの.wranglerでも除外する。
      "**/.wrangler/**",
      "**/.worker-dryrun*/**",
      // 恒久対策: 元は`.tmp-worker-api-dryrun-*`のみを除外していたが、
      // `.tmp-worker-api-internal-auth-dryrun-*`/`.tmp-worker-api-routes-dryrun-*`
      // のような検証対象名を挟むバリエーションが一致せず、Workerバンドル
      // (mutex$*等の巨大な難読化コード)がlint対象に混入しCIで無関係のerrorが
      // 大量発生した(T-207統合検証で発覚)。`*dryrun-*`でどの命名でも一致させる。
      "**/.tmp-worker-api-*dryrun-*/**",
      "content/generated/**",
      "next-env.d.ts",
      // 並列バックグラウンドセッション用のgit worktree(各自が独立したチェック
      // アウト)。除外しないと `npm run lint` が全worktreeを誤スキャンし、
      // 他タスクの一時ファイルでENOENT等が発生する(T5統合検証で発覚)。
      ".claude/worktrees/**",
    ],
  },
  {
    files: ["**/*.tsx"],
    plugins: { react: reactPlugin },
    rules: {
      // 設計書02§5.2「ハードコード文字列はESLintルール(no-literal-jsx-text)で禁止」を
      // react/jsx-no-literals で実装(JSXの直下テキストノードに文字列リテラルを禁止し、
      // messages/{ja,en}.json 経由の参照を強制する)。
      "react/jsx-no-literals": "error",
    },
  },
];

export default eslintConfig;
