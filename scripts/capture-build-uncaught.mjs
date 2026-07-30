/**
 * `npm run build`(next build)実行中に発生したuncaughtException/unhandledRejectionを
 * 確実に捕捉するための診断フック。
 *
 * next buildの静的ページ生成はjest-worker経由でchild_process.fork()された別プロセスで
 * 実行されるため、mainプロセス側でprocess.on('uncaughtException')を登録するだけでは
 * worker内の例外は捕捉できない。本スクリプトはNODE_OPTIONS=--import経由で読み込まれ、
 * child_process.fork()はデフォルトでNODE_OPTIONSを含む環境変数を子プロセスに引き継ぐため、
 * mainプロセスとworkerプロセスの両方で独立してハンドラが登録される。
 *
 * 捕捉した内容はスタックトレースを含めてstderrに出力する(CIトランスクリプトに残すため)。
 * また再現時の事後調査用にtmp/build-diagnostics/にも追記する(tmp/はgitignore対象)。
 * 元のNode.jsのデフォルト挙動(exit code 1で終了)は維持し、失敗を握りつぶさない。
 */
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "tmp", "build-diagnostics");
const LOG_FILE = path.join(LOG_DIR, "uncaught-exceptions.log");

function report(kind, err, extra) {
  const timestamp = new Date().toISOString();
  const isMainProcess = !process.send;
  const record = {
    timestamp,
    kind,
    pid: process.pid,
    processRole: isMainProcess ? "main" : "worker",
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : undefined,
    ...extra,
  };

  process.stderr.write(
    `\n[build-error-capture] ${kind} captured (pid=${record.pid}, role=${record.processRole})\n` +
      `${record.stack || record.message}\n\n`,
  );

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");
  } catch {
    // 診断ログの書き込み失敗はビルド失敗の本質ではないため無視する
  }
}

process.on("uncaughtException", (err, origin) => {
  report("uncaughtException", err, { origin });
  process.exitCode = 1;
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  report("unhandledRejection", err);
  process.exitCode = 1;
  process.exit(1);
});
