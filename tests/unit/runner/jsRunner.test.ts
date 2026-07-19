import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import { EXTERNAL_TIMEOUT_MS, runExercise, type WorkerLike } from "@/lib/runner/jsRunner";

function baseRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    code: "export function f() { return 1; }",
    entry: "f",
    tests: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

/** テスト用の最小Workerフェイク。postMessage呼び出しをトリガーに応答を制御する。 */
function createFakeWorker(): WorkerLike & { terminate: ReturnType<typeof vi.fn> } {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
}

describe("runExercise: 正常系", () => {
  it("resolves with the RunResult posted back by the worker, then terminates it", async () => {
    const worker = createFakeWorker();
    const passResult: RunResult = {
      result: "pass",
      perTest: [{ id: "t1", pass: true, actual: "1" }],
      logs: [],
      durationMs: 5,
    };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: passResult } as MessageEvent<RunResult>);
    });

    const result = await runExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(passResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("passes an error RunResult from the worker straight through (runtime exception inside user code)", async () => {
    const worker = createFakeWorker();
    const errorResult: RunResult = {
      result: "error",
      error: "boom",
      logs: [],
      durationMs: 5,
    };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: errorResult } as MessageEvent<RunResult>);
    });

    const result = await runExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(errorResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("runExercise: 実行時例外(Worker自体のクラッシュ)", () => {
  it("resolves with an error RunResult when the worker's global scope throws (onerror)", async () => {
    const worker = createFakeWorker();
    worker.postMessage = vi.fn(() => {
      worker.onerror?.({ message: "Uncaught ReferenceError: x is not defined" } as ErrorEvent);
    });

    const result = await runExercise(baseRequest(), { createWorker: () => worker });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("ReferenceError");
    }
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the ErrorEvent carries no message", async () => {
    const worker = createFakeWorker();
    worker.postMessage = vi.fn(() => {
      worker.onerror?.({ message: "" } as ErrorEvent);
    });

    const result = await runExercise(baseRequest(), { createWorker: () => worker });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("runExercise: 外部タイムアウト", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("force-terminates the worker and resolves with a timeout RunResult if nothing responds within 5s", async () => {
    const worker = createFakeWorker();
    // このWorkerは決して応答しない(同期無限ループ等で応答不能なケースを模す)。

    const pending = runExercise(baseRequest(), { createWorker: () => worker });

    expect(worker.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS);
    const result = await pending;

    expect(result).toEqual({ result: "timeout", logs: [], durationMs: EXTERNAL_TIMEOUT_MS });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not fire the external timeout if the worker already responded", async () => {
    const worker = createFakeWorker();
    const passResult: RunResult = {
      result: "pass",
      perTest: [],
      logs: [],
      durationMs: 1,
    };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: passResult } as MessageEvent<RunResult>);
    });

    const result = await runExercise(baseRequest(), { createWorker: () => worker });
    expect(result).toEqual(passResult);

    // タイマーを進めても、二重に処理されたり例外が飛んだりしないことを確認する。
    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS + 1000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("ignores a late onmessage that arrives after the external timeout already resolved", async () => {
    const worker = createFakeWorker();
    const passResult: RunResult = { result: "pass", perTest: [], logs: [], durationMs: 1 };
    worker.postMessage = vi.fn(() => {
      // 外部タイムアウト(5000ms)より後にWorkerが応答してくるケースを模す
      // (settledガードを外すと、この遅延応答でterminate()が2回目呼ばれてしまう)。
      setTimeout(() => {
        worker.onmessage?.({ data: passResult } as MessageEvent<RunResult>);
      }, EXTERNAL_TIMEOUT_MS + 1000);
    });

    const pending = runExercise(baseRequest(), { createWorker: () => worker });

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS);
    const result = await pending;
    expect(result).toEqual({ result: "timeout", logs: [], durationMs: EXTERNAL_TIMEOUT_MS });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
