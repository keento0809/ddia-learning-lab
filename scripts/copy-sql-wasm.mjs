#!/usr/bin/env node
// T-201(SQLランナー、02§7.3): sql.jsのWASM資産を同一オリジン配信するため、
// node_modules/sql.js/dist/ から public/generated/ へコピーする。
// sqlHarness.worker.ts の `initSqlJs({ locateFile })` はここに置かれたファイルを
// 相対パス "/generated/<file>" で参照する(CDNへは問い合わせない)。
// bundler(webpack/turbopack)側の`sql.js`解決条件(browser/default)により
// 実際に要求されるファイル名が変わりうるため、両方コピーしておく。
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(rootDir, "node_modules", "sql.js", "dist");
const outDir = path.join(rootDir, "public", "generated");

const FILES = ["sql-wasm.wasm", "sql-wasm-browser.wasm"];

mkdirSync(outDir, { recursive: true });

for (const file of FILES) {
  const src = path.join(distDir, file);
  if (!existsSync(src)) {
    console.error(`sql.jsのWASM資産が見つかりません: ${src}`);
    process.exit(1);
  }
  const dest = path.join(outDir, file);
  copyFileSync(src, dest);
  console.log(`コピーしました: ${dest}`);
}
