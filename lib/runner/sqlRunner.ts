import type { SqlRunRequest, SqlRunResult } from "@/lib/runner/sqlContracts";

/**
 * メインスレッド側のSQLランナー(T-201)。jsRunner.ts(T-107c)と同じ構成
 * (Workerを使い捨てで生成し、Promise化+外部強制タイムアウト)をSQL実行にも適用する。
 */
export const EXTERNAL_TIMEOUT_MS = 5000;

/** テスト時にモックへ差し替え可能な最小限のWorkerインターフェース。 */
export type SqlWorkerLike = {
  postMessage: (message: SqlRunRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<SqlRunResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type SqlWorkerFactory = () => SqlWorkerLike;

const defaultWorkerFactory: SqlWorkerFactory = () =>
  new Worker(new URL("./sqlHarness.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as SqlWorkerLike;

export type RunSqlExerciseDeps = {
  createWorker?: SqlWorkerFactory;
};

export function runSqlExercise(
  request: SqlRunRequest,
  deps: RunSqlExerciseDeps = {},
): Promise<SqlRunResult> {
  const createWorker = deps.createWorker ?? defaultWorkerFactory;

  return new Promise((resolve) => {
    const worker = createWorker();

    let settled = false;
    const settle = (result: SqlRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      worker.terminate();
      resolve(result);
    };

    const hardTimeout = setTimeout(() => {
      settle({ result: "timeout", durationMs: EXTERNAL_TIMEOUT_MS });
    }, EXTERNAL_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<SqlRunResult>) => {
      settle(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      settle({
        result: "error",
        error: event.message || "Worker実行中に不明なエラーが発生しました",
        durationMs: 0,
      });
    };

    worker.postMessage(request);
  });
}
