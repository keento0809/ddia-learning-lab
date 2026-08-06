import { RunResultSchema, type RunRequest, type RunResult } from "@/lib/contracts/runner";

/**
 * メインスレッド側のRunner(T-107c、02§7.1)。
 * Workerを使い捨てで生成し、Promise化+外部強制タイムアウトを行う。
 * タイムアウトの二重化のうち、内部の協調タイムアウト(request.timeoutMs)は
 * harness.worker.ts(createOnMessageHandler)側が担当し、ここでは同期無限ループ等
 * Worker自身が応答不能になるケースに対する最終防衛線として固定5秒でterminateする。
 */
export const EXTERNAL_TIMEOUT_MS = 5000;

/** テスト時にモックへ差し替え可能な最小限のWorkerインターフェース。 */
export type WorkerLike = {
  postMessage: (message: RunRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<RunResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type WorkerFactory = () => WorkerLike;

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./harness.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;

export type RunExerciseDeps = {
  createWorker?: WorkerFactory;
};

export function runExercise(request: RunRequest, deps: RunExerciseDeps = {}): Promise<RunResult> {
  const createWorker = deps.createWorker ?? defaultWorkerFactory;
  const start = Date.now();

  return new Promise((resolve) => {
    const worker = createWorker();

    let settled = false;
    const settle = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      worker.terminate();
      resolve(result);
    };

    const hardTimeout = setTimeout(() => {
      settle({ result: "timeout", logs: [], durationMs: EXTERNAL_TIMEOUT_MS });
    }, EXTERNAL_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<RunResult>) => {
      // T-705(findings.md High #4対応、SB-5): サンドボックス内のユーザーコードは
      // harnessと同一のWorkerグローバルスコープを共有するため、`self.postMessage(...)`を
      // 直接呼び出して契約(RunResultSchema)を満たさない構造を送りつけられる。
      // ここで検証せずそのままResultPanelへ渡すと、perTest等の必須フィールド欠落で
      // React描画自体がクラッシュする(演習ページの可用性喪失)。
      const parsed = RunResultSchema.safeParse(event.data);
      if (!parsed.success) {
        settle({
          result: "error",
          error: "サンドボックスから不正な形式の結果が返されました",
          logs: [],
          durationMs: Date.now() - start,
        });
        return;
      }
      settle(parsed.data);
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
