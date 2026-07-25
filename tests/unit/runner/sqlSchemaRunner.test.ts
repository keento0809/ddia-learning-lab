import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlSchemaRequest, SqlSchemaResult } from "@/lib/runner/sqlSchemaContracts";
import { EXTERNAL_TIMEOUT_MS, runSqlSchemaExercise, type SqlSchemaWorkerLike } from "@/lib/runner/sqlSchemaRunner";

function baseRequest(overrides: Partial<SqlSchemaRequest> = {}): SqlSchemaRequest {
  return { setupSql: "CREATE TABLE t(id INTEGER);", ...overrides };
}

function createFakeWorker(): SqlSchemaWorkerLike & { terminate: ReturnType<typeof vi.fn> } {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
}

describe("runSqlSchemaExercise: 正常系", () => {
  it("resolves with the SqlSchemaResult posted back by the worker, then terminates it", async () => {
    const worker = createFakeWorker();
    const okResult: SqlSchemaResult = {
      result: "ok",
      tables: [{ name: "t", columns: ["id"], sampleRows: [[1]] }],
    };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: okResult } as MessageEvent<SqlSchemaResult>);
    });

    const result = await runSqlSchemaExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(okResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("passes an error SqlSchemaResult from the worker straight through", async () => {
    const worker = createFakeWorker();
    const errorResult: SqlSchemaResult = { result: "error", error: "boom" };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: errorResult } as MessageEvent<SqlSchemaResult>);
    });

    const result = await runSqlSchemaExercise(baseRequest(), { createWorker: () => worker });

    expect(result).toEqual(errorResult);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("runSqlSchemaExercise: 実行時例外(Worker自体のクラッシュ)", () => {
  it("resolves with an error result when the worker's global scope throws (onerror)", async () => {
    const worker = createFakeWorker();
    worker.postMessage = vi.fn(() => {
      worker.onerror?.({ message: "Uncaught ReferenceError: x is not defined" } as ErrorEvent);
    });

    const result = await runSqlSchemaExercise(baseRequest(), { createWorker: () => worker });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("ReferenceError");
    }
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe("runSqlSchemaExercise: 外部タイムアウト", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("force-terminates the worker and resolves with an error result if nothing responds within 5s", async () => {
    const worker = createFakeWorker();

    const pending = runSqlSchemaExercise(baseRequest(), { createWorker: () => worker });

    expect(worker.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS);
    const result = await pending;

    expect(result.result).toBe("error");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not fire the external timeout if the worker already responded", async () => {
    const worker = createFakeWorker();
    const okResult: SqlSchemaResult = { result: "ok", tables: [] };
    worker.postMessage = vi.fn(() => {
      worker.onmessage?.({ data: okResult } as MessageEvent<SqlSchemaResult>);
    });

    const result = await runSqlSchemaExercise(baseRequest(), { createWorker: () => worker });
    expect(result).toEqual(okResult);

    await vi.advanceTimersByTimeAsync(EXTERNAL_TIMEOUT_MS + 1000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
