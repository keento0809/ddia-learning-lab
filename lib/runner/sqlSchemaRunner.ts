import type { SqlSchemaRequest, SqlSchemaResult } from "@/lib/runner/sqlSchemaContracts";

/**
 * メインスレッド側のスキーマビューアランナー。sqlRunner.ts(T-201)/jsRunner.ts
 * (T-107c)と同じ構成(Workerを使い捨てで生成し、Promise化+外部強制タイムアウト)。
 */
export const EXTERNAL_TIMEOUT_MS = 5000;

export type SqlSchemaWorkerLike = {
  postMessage: (message: SqlSchemaRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<SqlSchemaResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type SqlSchemaWorkerFactory = () => SqlSchemaWorkerLike;

const defaultWorkerFactory: SqlSchemaWorkerFactory = () =>
  new Worker(new URL("./sqlSchemaHarness.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as SqlSchemaWorkerLike;

export type RunSqlSchemaDeps = {
  createWorker?: SqlSchemaWorkerFactory;
};

export function runSqlSchemaExercise(
  request: SqlSchemaRequest,
  deps: RunSqlSchemaDeps = {},
): Promise<SqlSchemaResult> {
  const createWorker = deps.createWorker ?? defaultWorkerFactory;

  return new Promise((resolve) => {
    const worker = createWorker();

    let settled = false;
    const settle = (result: SqlSchemaResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      worker.terminate();
      resolve(result);
    };

    const hardTimeout = setTimeout(() => {
      settle({ result: "error", error: "スキーマ取得がタイムアウトしました" });
    }, EXTERNAL_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<SqlSchemaResult>) => {
      settle(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      settle({
        result: "error",
        error: event.message || "Worker実行中に不明なエラーが発生しました",
      });
    };

    worker.postMessage(request);
  });
}
