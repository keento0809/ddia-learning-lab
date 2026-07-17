import type { RunRequest, RunResult } from "./types";

/**
 * メインスレッド側のRunner(T-000原型)。
 * Workerを使い捨てで生成し、Promise化+ハードタイムアウト(limit+500ms→terminate)を行う。
 * 設計書 02§7.1 のタイムアウト二重化のうち、外側の強制terminateをここで担保する。
 */
export function runExercise(request: RunRequest): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./harness.worker.ts", import.meta.url), {
      type: "module",
    });

    let settled = false;
    const settle = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      worker.terminate();
      resolve(result);
    };

    const hardTimeout = setTimeout(() => {
      settle({ result: "timeout", logs: [], durationMs: request.timeoutMs + 500 });
    }, request.timeoutMs + 500);

    worker.onmessage = (event: MessageEvent<RunResult>) => {
      settle(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      settle({
        result: "error",
        error: event.message || "Worker実行中に不明なエラーが発生しました",
        logs: [],
        durationMs: 0,
      });
    };

    worker.postMessage(request);
  });
}
