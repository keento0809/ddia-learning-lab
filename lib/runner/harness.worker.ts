import type { RunLogEntry, RunPerTestResult, RunRequest, RunResult } from "@/lib/contracts/runner";

/**
 * サンドボックス実行ハーネス(T-107a)。
 * 設計書 02§7.1 の経路(静的チェック→危険API無効化→Blob URL経由ESM import→
 * テスト実行→構造化結果返送)を実装する。
 *
 * `runHarness` はモジュールロード手段(既定は Blob URL 経由の動的import)を
 * 差し替え可能にしてあり、これにより実Workerを起動せずにNode上のVitestで
 * 純粋関数として検証できる(禁止トークン検出/console上限/結果サイズ上限/
 * import失敗時のエラー返送)。実運用の worker スコープ配線は末尾の
 * `ctx.onmessage` のみが担う。
 */

// tsconfig の lib に webworker を含めていない(dom libとの型衝突を避けるため)ので
// worker専用グローバルはローカルに最小限のインターフェースとしてキャストする。
// self ではなく globalThis を使う(仕様上 self は worker スコープでは
// globalThis のエイリアスであり、かつ globalThis は Node 上でも常に存在するため
// このファイルを素の Node(Vitest)から安全にimportできる)。
type WorkerScope = {
  postMessage: (message: RunResult) => void;
  onmessage: ((event: { data: RunRequest }) => void) | null;
  fetch?: unknown;
  XMLHttpRequest?: unknown;
  WebSocket?: unknown;
  importScripts?: unknown;
};

const ctx = globalThis as unknown as WorkerScope;

/**
 * 禁止トークン検出(02§7.1 手順1)。
 * 単純な部分一致ではなく呼び出し形/単語境界で判定する(※テンプレ許可制:
 * `prefetchData` のような無関係な識別子や、コメント中の言及を誤検知しない)。
 */
const FORBIDDEN_TOKEN_RULES: { token: string; pattern: RegExp }[] = [
  { token: "importScripts", pattern: /\bimportScripts\b/ },
  { token: "fetch", pattern: /\bfetch\s*\(/ },
  { token: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { token: "Atomics.wait", pattern: /\bAtomics\s*\.\s*wait\b/ },
  { token: "eval", pattern: /\beval\s*\(/ },
  { token: "new Function", pattern: /\bnew\s+Function\b/ },
];

export function checkForbiddenTokens(code: string): string | null {
  for (const rule of FORBIDDEN_TOKEN_RULES) {
    if (rule.pattern.test(code)) {
      return `禁止された構文が含まれています: ${rule.token}`;
    }
  }
  return null;
}

/** 危険なグローバルの無効化(02§7.1 手順2「self.fetch等をundefinedに上書き」)。復元関数を返す。 */
function disableDangerousGlobals(): () => void {
  const original = {
    fetch: ctx.fetch,
    XMLHttpRequest: ctx.XMLHttpRequest,
    WebSocket: ctx.WebSocket,
    importScripts: ctx.importScripts,
  };
  const keys = Object.keys(original) as (keyof typeof original)[];
  for (const key of keys) {
    try {
      ctx[key] = undefined;
    } catch {
      // read-only環境では無視(既定でundefinedの場合もある)
    }
  }
  return () => {
    for (const key of keys) {
      try {
        ctx[key] = original[key];
      } catch {
        // noop
      }
    }
  };
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

/** console捕捉(02§7.1「{level, args(serialized, 200件上限)}」)。 */
export const MAX_LOG_ENTRIES = 200;

function createConsoleCapture(logs: RunLogEntry[]) {
  const capture =
    (level: RunLogEntry["level"]) =>
    (...args: unknown[]) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        logs.push({ level, args: args.map(safeStringify) });
      }
    };
  return { log: capture("log"), warn: capture("warn"), error: capture("error") };
}

/** 結果返送(02§7.1「結果メッセージは1MB上限(超過時 truncated フラグ)」)。 */
export const MAX_RESULT_BYTES = 1_000_000;
const MAX_LOG_ARG_CHARS = 500;
const MAX_TEST_FIELD_CHARS = 2000;
const MAX_PER_TEST_ENTRIES = 100;

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function clampString(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

function clampLogs(logs: RunLogEntry[]): RunLogEntry[] {
  return logs.map((entry) => ({
    ...entry,
    args: entry.args.map((arg) => clampString(arg, MAX_LOG_ARG_CHARS)),
  }));
}

export function truncateResult(result: RunResult): RunResult {
  if (byteLength(result) <= MAX_RESULT_BYTES) {
    return result;
  }

  const clampedLogs = clampLogs(result.logs);

  if (result.result === "pass" || result.result === "fail") {
    const clampedPerTest: RunPerTestResult[] = result.perTest
      .slice(0, MAX_PER_TEST_ENTRIES)
      .map((t) => ({
        ...t,
        actual: t.actual !== undefined ? clampString(t.actual, MAX_TEST_FIELD_CHARS) : undefined,
        error: t.error !== undefined ? clampString(t.error, MAX_TEST_FIELD_CHARS) : undefined,
      }));
    let next: RunResult = {
      ...result,
      logs: clampedLogs,
      perTest: clampedPerTest,
      truncated: true,
    };
    if (byteLength(next) <= MAX_RESULT_BYTES) return next;
    next = { ...next, logs: [] };
    return next;
  }

  if (result.result === "error") {
    let next: RunResult = {
      ...result,
      logs: clampedLogs,
      error: clampString(result.error, MAX_TEST_FIELD_CHARS),
    };
    if (byteLength(next) <= MAX_RESULT_BYTES) return next;
    next = { ...next, logs: [] };
    return next;
  }

  let next: RunResult = { ...result, logs: clampedLogs };
  if (byteLength(next) <= MAX_RESULT_BYTES) return next;
  next = { ...next, logs: [] };
  return next;
}

/** ユーザーコードのロード(02§7.1 手順3「Blob URL経由のESM dynamic import」)。 */
export async function loadModuleFromCode(code: string): Promise<Record<string, unknown>> {
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    return (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type HarnessDeps = {
  /**
   * テスト時に差し替え可能なモジュールローダ(既定は`loadModuleFromCode`)。
   * Node(Vitest)の標準ESMローダは blob: スキームの動的importを解決できないため、
   * 単体テストではここにモックを注入して禁止トークン検出以外の経路を検証する。
   */
  loadModule?: (code: string) => Promise<Record<string, unknown>>;
};

export async function runHarness(request: RunRequest, deps: HarnessDeps = {}): Promise<RunResult> {
  const loadModule = deps.loadModule ?? loadModuleFromCode;
  const start = Date.now();
  const logs: RunLogEntry[] = [];

  const staticError = checkForbiddenTokens(request.code);
  if (staticError) {
    return truncateResult({
      result: "error",
      error: staticError,
      logs,
      durationMs: Date.now() - start,
    });
  }

  const restoreGlobals = disableDangerousGlobals();
  const consoleCapture = createConsoleCapture(logs);
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  console.log = consoleCapture.log;
  console.warn = consoleCapture.warn;
  console.error = consoleCapture.error;

  try {
    let moduleExports: Record<string, unknown>;
    try {
      moduleExports = await loadModule(request.code);
    } catch (e) {
      return truncateResult({
        result: "error",
        error: `モジュールの読み込みに失敗しました: ${String(e)}`,
        logs,
        durationMs: Date.now() - start,
      });
    }

    const fn = moduleExports[request.entry];
    if (typeof fn !== "function") {
      return truncateResult({
        result: "error",
        error: `エクスポート関数 "${request.entry}" が見つかりません`,
        logs,
        durationMs: Date.now() - start,
      });
    }

    const perTest: RunPerTestResult[] = request.tests.map((test) => {
      try {
        const actual = (fn as (...args: unknown[]) => unknown)(...test.args);
        const pass = deepEquals(actual, test.expected);
        return { id: test.id, pass, actual: safeStringify(actual) };
      } catch (e) {
        return { id: test.id, pass: false, error: String(e) };
      }
    });

    const allPass = perTest.every((t) => t.pass);
    return truncateResult({
      result: allPass ? "pass" : "fail",
      perTest,
      logs,
      durationMs: Date.now() - start,
    });
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    restoreGlobals();
  }
}

/**
 * タイムアウトの二重化(T-107c、02§7.1「Worker内部の協調タイムアウト」)のうち
 * Worker側の担当分。`request.timeoutMs`経過時点で`runHarness`がまだ解決していなければ
 * 自発的に`{result:"timeout"}`を返送する。非同期処理がイベントループを塞がずに
 * ハングしているケース(例: 解決しないPromiseをawaitし続ける)はこれで捕捉できるが、
 * 同期無限ループはこのタイマー自体が発火しないため捕捉できない
 * (その場合はメインスレッド側jsRunner.tsの強制terminateが最終防衛線となる)。
 */
export function createOnMessageHandler(
  deps: HarnessDeps = {},
  postMessage: (message: RunResult) => void = (message) => ctx.postMessage(message),
): (event: { data: RunRequest }) => void {
  return (event) => {
    const request = event.data;
    let responded = false;

    const internalTimeout = setTimeout(() => {
      if (responded) return;
      responded = true;
      postMessage(
        truncateResult({
          result: "timeout",
          logs: [],
          durationMs: request.timeoutMs,
        }),
      );
    }, request.timeoutMs);

    void runHarness(request, deps).then((result) => {
      if (responded) return;
      responded = true;
      clearTimeout(internalTimeout);
      postMessage(result);
    });
  };
}

ctx.onmessage = createOnMessageHandler();
