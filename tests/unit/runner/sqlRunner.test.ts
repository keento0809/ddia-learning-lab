import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlRunRequest, SqlRunResult } from "@/lib/runner/sqlContracts";
import { EXTERNAL_TIMEOUT_MS, runSqlExercise, type SqlWorkerLike } from "@/lib/runner/sqlRunner";

function baseRequest(overrides: Partial<SqlRunRequest> = {}): SqlRunRequest {
  return {
    setupSql: "CREATE TABLE t(id INTEGER);",
    userSql: "SELECT 1;",
    tests: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

function createFakeWorker(): SqlWorkerLike & { terminate: ReturnType<typeof vi.fn> } {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
}

describe("runSqlExercise: 正常系", () => {
  it("resolves with the SqlRunResult posted back by the worker, then terminates it", async () => {
    const worker = createFakeWorker();
    const passResult: SqlRunResult = {
      result: "pass",
      perTest: [{ id: "t1", pass: true }],
      durationMs: 5,
    };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: passResult } as MessageEvent<SqlRunResult>);
    });

    const result = await runSqlExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(passResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("passes an error SqlRunResult from the worker straight through", async () => {
    const worker = createFakeWorker();
    const errorResult: SqlRunResult = { result: "error", error: "boom", durationMs: 5 };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: errorResult } as MessageEvent<SqlRunResult>);
    });

    const result = await runSqlExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(errorResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("runSqlExercise: 実行時例外(Worker自体のクラッシュ)", () => {
  it("resolves with an error SqlRunResult when the worker's global scope throws (onerror)", async () => {
    const worker = createFakeWorker();
    worker.postMessage = vi.fn(() => {
      worker.onerror?.({ message: "Uncaught ReferenceError: x is not defined" } as ErrorEvent);
    });

    const result = await runSqlExercise(baseRequest(), { createWorker: () => worker });

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

    const result = await runSqlExercise(baseRequest(), { createWorker: () => worker });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("runSqlExercise: 外部タイムアウト", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("force-terminates the worker and resolves with a timeout SqlRunResult if nothing responds within 5s", async () => {
    const worker = createFakeWorker();

    const pending = runSqlExercise(baseRequest(), { createWorker: () => worker });

    expect(worker.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS);
    const result = await pending;

    expect(result).toEqual({ result: "timeout", durationMs: EXTERNAL_TIMEOUT_MS });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not fire the external timeout if the worker already responded", async () => {
    const worker = createFakeWorker();
    const passResult: SqlRunResult = { result: "pass", perTest: [], durationMs: 1 };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: passResult } as MessageEvent<SqlRunResult>);
    });

    const result = await runSqlExercise(baseRequest(), { createWorker: () => worker });
    expect(result).toEqual(passResult);

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS + 1000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("ignores a late onmessage that arrives after the external timeout already resolved", async () => {
    const worker = createFakeWorker();
    const passResult: SqlRunResult = { result: "pass", perTest: [], durationMs: 1 };
    worker.postMessage = vi.fn(() => {
      setTimeout(() => {
        worker.onmessage?.({ data: passResult } as MessageEvent<SqlRunResult>);
      }, EXTERNAL_TIMEOUT_MS + 1000);
    });

    const pending = runSqlExercise(baseRequest(), { createWorker: () => worker });

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS);
    const result = await pending;
    expect(result).toEqual({ result: "timeout", durationMs: EXTERNAL_TIMEOUT_MS });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
