import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import {
  MAX_LOG_ENTRIES,
  MAX_RESULT_BYTES,
  checkForbiddenTokens,
  createOnMessageHandler,
  loadModuleFromCode,
  runHarness,
  truncateResult,
} from "@/lib/runner/harness.worker";

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function baseRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    code: "export function f() { return 1; }",
    entry: "f",
    tests: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

describe("checkForbiddenTokens", () => {
  it.each([
    ["importScripts", 'importScripts("https://evil.example/x.js");'],
    ["fetch", 'fetch("https://evil.example");'],
    ["XMLHttpRequest", "const x = new XMLHttpRequest();"],
    ["Atomics.wait", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);"],
    ["eval", 'eval("1 + 1");'],
    ["new Function", 'const f = new Function("return 1");'],
  ])("detects forbidden token: %s", (token, code) => {
    expect(checkForbiddenTokens(code)).toContain(token);
  });

  it("does not flag benign code containing similar-looking identifiers", () => {
    expect(
      checkForbiddenTokens(
        "export function prefetchData() { return 'evaluated'; } // new Functional style",
      ),
    ).toBeNull();
  });
});

describe("runHarness: 禁止トークン", () => {
  it("returns an error result and never loads the module when a forbidden token is present", async () => {
    const loadModule = vi.fn();
    const result = await runHarness(
      baseRequest({ code: 'fetch("https://evil.example"); export function f() { return 1; }' }),
      { loadModule },
    );

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("fetch");
    }
    expect(loadModule).not.toHaveBeenCalled();
  });
});

describe("runHarness: import失敗時のerror返送", () => {
  it("returns an error result when the module loader rejects", async () => {
    const result = await runHarness(baseRequest(), {
      loadModule: async () => {
        throw new Error("boom");
      },
    });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("boom");
    }
  });

  it("returns an error result when the entry export is not a function", async () => {
    const result = await runHarness(baseRequest({ entry: "missing" }), {
      loadModule: async () => ({ f: 1 }),
    });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error).toContain("missing");
    }
  });

  it("rejects for real (Blob URL loader) on syntactically invalid code", async () => {
    await expect(loadModuleFromCode("export function (( invalid")).rejects.toBeTruthy();
  });
});

describe("runHarness: console上限", () => {
  it("caps captured console logs at MAX_LOG_ENTRIES even when user code logs more", async () => {
    const result = await runHarness(
      baseRequest({ tests: [{ id: "t1", args: [], expected: 42 }] }),
      {
        loadModule: async () => ({
          f: () => {
            for (let i = 0; i < MAX_LOG_ENTRIES + 300; i++) {
              console.log("line", i);
            }
            return 42;
          },
        }),
      },
    );

    expect(result.result).toBe("pass");
    expect(result.logs).toHaveLength(MAX_LOG_ENTRIES);
  });

  it("does not leak console overrides to the surrounding test process", async () => {
    const originalLog = console.log;
    await runHarness(baseRequest(), {
      loadModule: async () => ({
        f: () => {
          console.log("inside sandbox");
          return 1;
        },
      }),
    });
    expect(console.log).toBe(originalLog);
  });
});

describe("runHarness: 危険なグローバルの無効化", () => {
  it("disables fetch/XMLHttpRequest while user code runs, and restores them afterward", async () => {
    const originalFetch = globalThis.fetch;
    const result = await runHarness(
      baseRequest({ tests: [{ id: "t1", args: [], expected: true }] }),
      {
        loadModule: async () => ({
          f: () => typeof fetch === "undefined" && typeof XMLHttpRequest === "undefined",
        }),
      },
    );

    expect(result.result).toBe("pass");
    expect(globalThis.fetch).toBe(originalFetch);
  });
});

describe("runHarness: pass/fail 判定", () => {
  it("reports pass when all tests match and fail when any mismatch", async () => {
    const loadModule = async () => ({ f: (n: number) => n * 2 });

    const passing = await runHarness(
      baseRequest({ entry: "f", tests: [{ id: "t1", args: [2], expected: 4 }] }),
      { loadModule },
    );
    expect(passing.result).toBe("pass");

    const failing = await runHarness(
      baseRequest({ entry: "f", tests: [{ id: "t1", args: [2], expected: 5 }] }),
      { loadModule },
    );
    expect(failing.result).toBe("fail");
  });
});

describe("runHarness: test.fnによる呼び出し先の振り分け(02§5.3 call.fn)", () => {
  it("各テストがtest.fnで指定した別々のexport関数を呼び出す(entry以外への振り分け)", async () => {
    const loadModule = async () => ({
      percentile: (values: number[]) => Math.max(...values),
      worstOfConcurrentCalls: (values: number[]) => Math.min(...values),
    });

    const result = await runHarness(
      baseRequest({
        entry: "percentile",
        tests: [
          { id: "t1", fn: "percentile", args: [[1, 5, 9]], expected: 9 },
          { id: "t2", fn: "worstOfConcurrentCalls", args: [[1, 5, 9]], expected: 1 },
        ],
      }),
      { loadModule },
    );

    expect(result.result).toBe("pass");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest).toEqual([
        { id: "t1", pass: true, actual: "9" },
        { id: "t2", pass: true, actual: "1" },
      ]);
    }
  });

  it("test.fn省略時はentryを呼び出す(後方互換)", async () => {
    const result = await runHarness(
      baseRequest({
        entry: "f",
        tests: [{ id: "t1", args: [2], expected: 4 }],
      }),
      { loadModule: async () => ({ f: (n: number) => n * 2 }) },
    );

    expect(result.result).toBe("pass");
  });

  it("誤ってentryを呼んでいたら失敗するはずのテストが、正しいfnにより合格する(バグ再現の反例)", async () => {
    // entryは"percentile"だが、このテストはentryではなく"worstOfConcurrentCalls"を
    // 対象にしている。もしharnessが(修正前のように)常にentryだけを呼んでいたら、
    // percentile([1,5,9]) === 9 になり expected(1) と一致せず fail するはず。
    const loadModule = async () => ({
      percentile: (values: number[]) => Math.max(...values),
      worstOfConcurrentCalls: (values: number[]) => Math.min(...values),
    });

    const result = await runHarness(
      baseRequest({
        entry: "percentile",
        tests: [{ id: "t1", fn: "worstOfConcurrentCalls", args: [[1, 5, 9]], expected: 1 }],
      }),
      { loadModule },
    );

    expect(result.result).toBe("pass");
  });

  it("test.fnが指す関数が存在しない場合、そのテストだけpass:falseになり他のテストは継続する", async () => {
    const result = await runHarness(
      baseRequest({
        entry: "f",
        tests: [
          { id: "t1", fn: "missingHelper", args: [], expected: 1 },
          { id: "t2", fn: "f", args: [2], expected: 4 },
        ],
      }),
      { loadModule: async () => ({ f: (n: number) => n * 2 }) },
    );

    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0]).toEqual({
        id: "t1",
        pass: false,
        error: 'エクスポート関数 "missingHelper" が見つかりません',
      });
      expect(result.perTest[1]).toEqual({ id: "t2", pass: true, actual: "4" });
    }
  });
});

describe("runHarness: test.assertによる採点(02§7.2、lib/runner/grader.tsのevaluateAssert配線)", () => {
  it("失敗→恒久対策(verify/grader-assert-wiring): assert未指定時は従来通りexpectedとの単純deepEqualsで判定する(後方互換)", async () => {
    const result = await runHarness(
      baseRequest({ entry: "f", tests: [{ id: "t1", args: [], expected: { a: 1 } }] }),
      { loadModule: async () => ({ f: () => ({ a: 1 }) }) },
    );

    expect(result.result).toBe("pass");
  });

  it("assert: equals/deepEqualsはgrader.tsのevaluateAssertを通っても従来と同じ合否になる", async () => {
    const result = await runHarness(
      baseRequest({
        entry: "double",
        tests: [
          { id: "t1", fn: "double", args: [2], expected: 4, assert: { type: "equals", value: 4 } },
          { id: "t2", fn: "double", args: [2], expected: 4, assert: { type: "equals", value: 5 } },
          {
            id: "t3",
            fn: "pair",
            args: [1, 2],
            expected: [1, 2],
            assert: { type: "deepEquals", value: [1, 2] },
          },
        ],
      }),
      {
        loadModule: async () => ({
          double: (n: number) => n * 2,
          pair: (a: number, b: number) => [a, b],
        }),
      },
    );

    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0]).toEqual({ id: "t1", pass: true, actual: "4" });
      expect(result.perTest[1].pass).toBe(false);
      expect(result.perTest[1].actual).toBe("4");
      expect(result.perTest[1].error).toContain("5");
      expect(result.perTest[2]).toEqual({ id: "t3", pass: true, actual: "[1,2]" });
    }
  });

  it("assert: oneOfは実Workerパス(runHarness)で正しく合否判定される(従来はUnsupportedExerciseTestCaseErrorで弾かれ未到達だった経路)", async () => {
    const result = await runHarness(
      baseRequest({
        entry: "pickStatus",
        tests: [
          {
            id: "t1",
            fn: "pickStatus",
            args: [200],
            expected: ["ok", "created"],
            assert: { type: "oneOf", value: ["ok", "created"] },
          },
          {
            id: "t2",
            fn: "pickStatus",
            args: [500],
            expected: ["ok", "created"],
            assert: { type: "oneOf", value: ["ok", "created"] },
          },
        ],
      }),
      {
        loadModule: async () => ({
          pickStatus: (code: number) => (code < 300 ? "ok" : "error"),
        }),
      },
    );

    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0]).toEqual({ id: "t1", pass: true, actual: '"ok"' });
      expect(result.perTest[1].pass).toBe(false);
      expect(result.perTest[1].actual).toBe('"error"');
      expect(result.perTest[1].error).toContain("期待値のいずれとも一致しませんでした");
    }
  });

  it("assert: matchesは実Workerパス(runHarness)で正しく合否判定される(従来はUnsupportedExerciseTestCaseErrorで弾かれ未到達だった経路)", async () => {
    const result = await runHarness(
      baseRequest({
        entry: "formatId",
        tests: [
          {
            id: "t1",
            fn: "formatId",
            args: [42],
            expected: "^user-\\d+$",
            assert: { type: "matches", value: "^user-\\d+$" },
          },
          {
            id: "t2",
            fn: "formatId",
            args: [-1],
            expected: "^user-\\d+$",
            assert: { type: "matches", value: "^user-\\d+$" },
          },
        ],
      }),
      {
        loadModule: async () => ({
          formatId: (n: number) => (n >= 0 ? `user-${n}` : "invalid"),
        }),
      },
    );

    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0]).toEqual({ id: "t1", pass: true, actual: '"user-42"' });
      expect(result.perTest[1].pass).toBe(false);
      expect(result.perTest[1].error).toContain("期待した正規表現に一致しませんでした");
    }
  });
});

describe("truncateResult: 結果サイズ上限", () => {
  it("returns the result unchanged when within the size limit", () => {
    const result: RunResult = {
      result: "pass",
      perTest: [{ id: "t1", pass: true, actual: "1" }],
      logs: [],
      durationMs: 1,
    };
    expect(truncateResult(result)).toEqual(result);
  });

  it("truncates oversized pass/fail results and sets the truncated flag", () => {
    const result: RunResult = {
      result: "pass",
      perTest: Array.from({ length: 20 }, (_, i) => ({
        id: `t${i}`,
        pass: true,
        actual: "x".repeat(100_000),
      })),
      logs: Array.from({ length: MAX_LOG_ENTRIES }, () => ({
        level: "log" as const,
        args: ["x".repeat(20_000)],
      })),
      durationMs: 1,
    };

    const truncated = truncateResult(result);
    expect(byteLength(truncated)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(truncated.result).toBe("pass");
    if (truncated.result === "pass" || truncated.result === "fail") {
      expect(truncated.truncated).toBe(true);
    }
  });

  it("truncates oversized error/timeout results without adding a truncated field they don't support", () => {
    const result: RunResult = {
      result: "error",
      error: "boom",
      logs: Array.from({ length: MAX_LOG_ENTRIES }, () => ({
        level: "log" as const,
        args: ["x".repeat(20_000)],
      })),
      durationMs: 1,
    };

    const truncated = truncateResult(result);
    expect(byteLength(truncated)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(truncated.result).toBe("error");
  });

  it("clamps an oversized error message itself, not just logs", () => {
    const result: RunResult = {
      result: "error",
      error: "x".repeat(2_000_000),
      logs: [],
      durationMs: 1,
    };

    const truncated = truncateResult(result);
    expect(byteLength(truncated)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(truncated.result).toBe("error");
  });

  it("end-to-end: runHarness truncates a huge error message thrown during module load", async () => {
    const bigMessage = "x".repeat(2_000_000);
    const result = await runHarness(baseRequest(), {
      loadModule: async () => {
        throw new Error(bigMessage);
      },
    });

    expect(result.result).toBe("error");
    expect(byteLength(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  });

  it("end-to-end: runHarness truncates a huge actual value produced by user code", async () => {
    const bigString = "x".repeat(2_000_000);
    const result = await runHarness(
      baseRequest({ entry: "f", tests: [{ id: "t1", args: [], expected: "not-equal" }] }),
      { loadModule: async () => ({ f: () => bigString }) },
    );

    expect(byteLength(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.truncated).toBe(true);
    }
  });
});

describe("createOnMessageHandler: タイムアウトの二重化(内部協調タイムアウト)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("正常系: runHarnessの結果をそのままpostMessageする", async () => {
    const postMessage = vi.fn();
    const handler = createOnMessageHandler(
      { loadModule: async () => ({ f: () => 1 }) },
      postMessage,
    );

    handler({ data: baseRequest({ tests: [{ id: "t1", args: [], expected: 1 }] }) });
    await vi.runAllTimersAsync();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].result).toBe("pass");
  });

  it("実行時例外: runHarnessがerror結果を返した場合もそのままpostMessageする", async () => {
    const postMessage = vi.fn();
    const handler = createOnMessageHandler(
      {
        loadModule: async () => {
          throw new Error("boom");
        },
      },
      postMessage,
    );

    handler({ data: baseRequest() });
    await vi.runAllTimersAsync();

    expect(postMessage).toHaveBeenCalledTimes(1);
    const posted = postMessage.mock.calls[0][0] as RunResult;
    expect(posted.result).toBe("error");
    if (posted.result === "error") {
      expect(posted.error).toContain("boom");
    }
  });

  it("タイムアウト: request.timeoutMs以内にrunHarnessが解決しない場合、自発的にtimeout結果を1回だけpostMessageする", async () => {
    const postMessage = vi.fn();
    const neverResolves = new Promise<Record<string, unknown>>(() => {});
    const handler = createOnMessageHandler({ loadModule: () => neverResolves }, postMessage);

    handler({ data: baseRequest({ timeoutMs: 3000 }) });

    await vi.advanceTimersByTimeAsync(2999);
    expect(postMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toEqual({ result: "timeout", logs: [], durationMs: 3000 });

    // ハングしていたPromiseがその後解決しても、二重postMessageされないこと。
    await vi.advanceTimersByTimeAsync(10_000);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("タイムアウト後にrunHarnessが遅れて解決しても、後発の結果でtimeout結果が上書きされない", async () => {
    const postMessage = vi.fn();
    const lateModule = new Promise<Record<string, unknown>>((resolve) => {
      setTimeout(() => resolve({ f: () => 1 }), 10_000);
    });
    const handler = createOnMessageHandler({ loadModule: () => lateModule }, postMessage);

    handler({
      data: baseRequest({ timeoutMs: 3000, tests: [{ id: "t1", args: [], expected: 1 }] }),
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toEqual({ result: "timeout", logs: [], durationMs: 3000 });

    // loadModuleが10秒後に遅延解決し、runHarnessがpass結果を返しても無視されること
    // (responded ガードを外すと、この時点でpostMessageが2回目呼ばれてpass結果に上書きされてしまう)。
    await vi.advanceTimersByTimeAsync(7000);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
