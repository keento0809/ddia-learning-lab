#!/usr/bin/env node
// ADR-008(docs/design/09) §2「worker-apiはservice binding経由のみ到達可能な非公開Worker」の
// 恒常検証(T-504)。wrangler.jsoncのworkers_dev既定値はtrue(未指定でも公開されてしまう)
// なので、設定ミスで再び公開ルートが生えることを防ぐガードレールとしてCIで毎回実行する。
import { readFileSync } from "node:fs";

// wrangler.jsonc内のコメントは常に行頭"//"の独立行(このリポジトリの既存2ファイルの慣習)。
// 追加の依存(jsonc-parser等)を避けるため、その前提でコメント行のみ除去してJSON.parseする。
function readJsonc(path) {
  const raw = readFileSync(path, "utf-8");
  const stripped = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(stripped);
}

const path = "workers/api/wrangler.jsonc";
const config = readJsonc(path);

const problems = [];

if (config.workers_dev !== false) {
  problems.push(
    `workers_dev が false ではありません(現在値: ${JSON.stringify(config.workers_dev)})。` +
      "未指定だと既定値trueで<name>.<subdomain>.workers.devが公開されます。",
  );
}

if (config.routes !== undefined) {
  problems.push(`routes が設定されています: ${JSON.stringify(config.routes)}`);
}

if (config.route !== undefined) {
  problems.push(`route が設定されています: ${JSON.stringify(config.route)}`);
}

if (problems.length > 0) {
  console.error(`[worker-visibility] ${path}: worker-apiが公開される設定になっています(ADR-008 §2違反)。`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `[worker-visibility] OK: ${path} は非公開設定(workers_dev: false, routes/route未設定)です。`,
);
