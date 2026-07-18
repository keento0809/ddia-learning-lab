#!/usr/bin/env node
// Cloudflare Workers サーババンドルサイズゲート(ADR-007 C-1)。
// Free プランのスクリプトサイズ上限(3MiB, gzip後)に対し、2.5MiBで警告、3MiBで失敗する。
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const WARN_BYTES = 2.5 * 1024 * 1024;
const FAIL_BYTES = 3 * 1024 * 1024;

const workerPath = process.argv[2] ?? ".worker-dryrun/worker.js";

let raw;
try {
  raw = readFileSync(workerPath);
} catch (error) {
  console.error(`バンドルサイズゲート: ${workerPath} を読み込めませんでした。`);
  console.error(error.message);
  process.exit(1);
}

const gzipBytes = gzipSync(raw).byteLength;
const gzipMiB = gzipBytes / (1024 * 1024);

console.log(
  `Worker bundle (gzip): ${gzipMiB.toFixed(3)} MiB (${gzipBytes} bytes) — ${workerPath}`,
);

if (gzipBytes > FAIL_BYTES) {
  console.error(
    `失敗: gzip後サイズが3MiB(Cloudflare Workers Freeプラン上限)を超えています。`,
  );
  process.exit(1);
}

if (gzipBytes > WARN_BYTES) {
  console.warn(
    `警告: gzip後サイズが2.5MiBを超えています。3MiB上限に近づいています(ADR-007 C-1)。`,
  );
}
