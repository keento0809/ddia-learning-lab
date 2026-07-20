#!/usr/bin/env node
// Cloudflare Workers サーババンドルサイズゲート(ADR-008 §3、ADR-007 C-1を改訂)。
// worker-app/worker-api共通のWorker別サイズ予算(gzip後2.5MiB)に対し、
// 2.0MiBで警告、2.5MiBで失敗する。呼び出し側(CI)がWorker別に本スクリプトを実行する
// マトリクス構成とすることで、Worker別に予算を強制する。
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const WARN_BYTES = 2.0 * 1024 * 1024;
const FAIL_BYTES = 2.5 * 1024 * 1024;

const workerPath = process.argv[2] ?? ".worker-dryrun/worker.js";
const workerLabel = process.argv[3] ?? workerPath;

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
const remainingToWarnMiB = (WARN_BYTES - gzipBytes) / (1024 * 1024);
const remainingToFailMiB = (FAIL_BYTES - gzipBytes) / (1024 * 1024);

console.log(
  `[${workerLabel}] Worker bundle (gzip): ${gzipMiB.toFixed(3)} MiB (${gzipBytes} bytes) — ${workerPath}`,
);
console.log(
  `[${workerLabel}] 残余裕: 警告(2.0MiB)まで ${remainingToWarnMiB.toFixed(3)} MiB / 失敗(2.5MiB)まで ${remainingToFailMiB.toFixed(3)} MiB`,
);

if (gzipBytes > FAIL_BYTES) {
  console.error(
    `[${workerLabel}] 失敗: gzip後サイズが2.5MiB(ADR-008 §3 サイズ予算)を超えています。`,
  );
  process.exit(1);
}

if (gzipBytes > WARN_BYTES) {
  console.warn(
    `[${workerLabel}] 警告: gzip後サイズが2.0MiBを超えています。2.5MiB上限に近づいています(ADR-008 §3)。`,
  );
}
