import type { LogEntry, PerTestResult, RunRequest, RunResult } from "./types";

/**
 * サンドボックス実行ハーネスの原型(T-000)。
 * 静的チェック→危険API無効化→Blob URL経由のESM import→テスト実行→結果返送、
 * という設計書 02§7.1 の経路を最小実装で貫通させる。禁止トークンの網羅性や
 * grader.tsのassert種別拡充は T-107a/b で行う。
 */

// tsconfig の lib に webworker を含めていない(dom libとの型衝突を避けるため)ので
// worker専用グローバルはローカルに最小限のインターフェースとしてキャストする。
type WorkerScope = {
  postMessage: (message: RunResult) => void;
  onmessage: ((event: { data: RunRequest }) => void) | null;
  fetch?: unknown;
  XMLHttpRequest?: unknown;
  importScripts?: unknown;
};

const ctx = self as unknown as WorkerScope;

const FORBIDDEN_TOKENS = [
  "importScripts",
  "XMLHttpRequest",
  "Atomics.wait",
  "new Function",
  "eval(",
];

function staticCheck(code: string): string | null {
  for (const token of FORBIDDEN_TOKENS) {
    if (code.includes(token)) {
      return `禁止された構文が含まれています: ${token}`;
    }
  }
  return null;
}

function disableDangerousGlobals() {
  try {
    ctx.fetch = undefined;
  } catch {
    // read-only環境では無視(既定でundefinedの場合もある)
  }
  try {
    ctx.XMLHttpRequest = undefined;
  } catch {
    // noop
  }
  try {
    ctx.importScripts = undefined;
  } catch {
    // noop
  }
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEquals(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEquals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const MAX_LOG_ENTRIES = 200;

function installConsoleCapture(logs: LogEntry[]) {
  const capture = (level: LogEntry["level"]) =>
    (...args: unknown[]) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        logs.push({ level, args: args.map(safeStringify) });
      }
    };
  console.log = capture("log");
  console.warn = capture("warn");
  console.error = capture("error");
}

ctx.onmessage = (event: { data: RunRequest }) => {
  void handleRun(event.data);
};

async function handleRun(request: RunRequest) {
  const start = Date.now();
  const logs: LogEntry[] = [];
  installConsoleCapture(logs);

  const staticError = staticCheck(request.code);
  if (staticError) {
    ctx.postMessage({
      result: "error",
      error: staticError,
      logs,
      durationMs: Date.now() - start,
    });
    return;
  }

  disableDangerousGlobals();

  let moduleExports: Record<string, unknown>;
  try {
    const blob = new Blob([request.code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    moduleExports = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;
    URL.revokeObjectURL(url);
  } catch (e) {
    ctx.postMessage({
      result: "error",
      error: `モジュールの読み込みに失敗しました: ${String(e)}`,
      logs,
      durationMs: Date.now() - start,
    });
    return;
  }

  const fn = moduleExports[request.entry];
  if (typeof fn !== "function") {
    ctx.postMessage({
      result: "error",
      error: `エクスポート関数 "${request.entry}" が見つかりません`,
      logs,
      durationMs: Date.now() - start,
    });
    return;
  }

  const perTest: PerTestResult[] = request.tests.map((test) => {
    try {
      const actual = (fn as (...args: unknown[]) => unknown)(...test.args);
      const pass = deepEquals(actual, test.expected);
      return { id: test.id, pass, actual: safeStringify(actual) };
    } catch (e) {
      return { id: test.id, pass: false, error: String(e) };
    }
  });

  const allPass = perTest.every((t) => t.pass);
  ctx.postMessage({
    result: allPass ? "pass" : "fail",
    perTest,
    logs,
    durationMs: Date.now() - start,
  });
}
