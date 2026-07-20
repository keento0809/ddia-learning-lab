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
      "**/.worker-dryrun*/**",
      "**/.tmp-worker-api-dryrun-*/**",
      "content/generated/**",
      "next-env.d.ts",
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
