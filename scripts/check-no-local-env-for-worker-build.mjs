#!/usr/bin/env node
// T-705(ADR-010(docs/design/11) §3.5 DP-3・§5): ビルド成果物へのシークレット混入対策。
//
// @opennextjs/cloudflare は `opennextjs-cloudflare build` 実行時、Next.jsの環境変数
// 読み込み順序(.env → .env.production → .env.local → .env.production.local)に従って
// ローカルの.env系ファイルを読み取り、その値をそのまま`.open-next/cloudflare/next-env.mjs`
// (`export const production = {...}`)へ平文で書き出す(node_modules/@opennextjs/cloudflare/
// dist/cli/utils/extract-project-env-vars.js、compile-env-files.js)。このファイルは
// worker.jsの実行時に参照されるため、ローカルに実クレデンシャル入りの.envを置いたまま
// `npm run build:worker`や`npm run preview`を実行すると、ビルド成果物(延いてはデプロイ
// 先のWorker)へ平文のシークレットが混入する。
//
// CI経由のデプロイは.envを配置しない運用のため影響しない。リスクは「ローカルから手動で
// build:worker/previewを実行する」経路に限定される。@opennextjs/cloudflareのenv snapshot
// 機構自体を無効化するオプションは提供されていない(Next.jsの環境変数読み込みに追随する
// ための意図的な機能のため)ため、ビルド専用ディレクトリの切り出しよりも、危険な状態
// (ローカル.envの存在)を検知して確実に停止するガードとして実装する(恒久対策)。
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Next.jsの本番環境変数読み込み順序(mode="production")に対応する候補ファイル名。
 * extractProjectEnvVars(node_modules/@opennextjs/cloudflare)と同じ並び。
 */
export const ENV_FILE_CANDIDATES = [".env", ".env.production", ".env.local", ".env.production.local"];

/**
 * cwd配下に存在するローカル環境変数ファイルを列挙する(副作用なしのテスト用に
 * existsSyncを注入可能にしてある。generate-worker-csp-headers.mjsの
 * resolveWorkerChunkFileと同じパターン)。
 * @param {string} cwd
 * @param {(p: string) => boolean} exists
 */
export function findLocalEnvFiles(cwd, exists = (p) => existsSync(p)) {
  return ENV_FILE_CANDIDATES.filter((name) => exists(path.join(cwd, name)));
}

function main() {
  const cwd = process.cwd();
  const found = findLocalEnvFiles(cwd);

  if (found.length > 0) {
    console.error(
      "[check-no-local-env-for-worker-build] ローカルに.env系ファイルが存在するため、" +
        "Cloudflare Worker向けビルドを停止しました(T-705)。",
    );
    console.error(`  検出: ${found.join(", ")}`);
    console.error(
      "  理由: @opennextjs/cloudflareはビルド時にこれらの値を読み取り、" +
        ".open-next/cloudflare/next-env.mjs経由でworker.jsへ平文で埋め込みます。" +
        "ローカルに実クレデンシャルがある状態でビルドすると、成果物に平文のシークレットが" +
        "混入します。",
    );
    console.error(
      "  対処: 対象ファイルを一時的に退避してから再実行してください" +
        "(例: mv .env .env.bak && npm run build:worker && mv .env.bak .env)。" +
        "デプロイはCI経由(.env非存在)のみに限定することを推奨します。",
    );
    process.exit(1);
  }

  console.log("[check-no-local-env-for-worker-build] OK: ローカルに.env系ファイルは存在しません。");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
