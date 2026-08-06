import type { RunLogEntry, RunPerTestResult, RunRequest, RunResult } from "@/lib/contracts/runner";
import { evaluateAssert } from "./grader";

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
 *
 * テストごとの呼び出し対象は`test.fn`(省略時は`entry`)で決まる(02§5.3の
 * `call.fn`が`RunRequest.tests[].fn`として伝搬される、fix/grader-call-fn参照)。
 * `entry`自体は「モジュールが正しくロードできたか」を検証するチェックとして
 * 引き続き使う。
 *
 * 失敗→恒久対策(verify/grader-assert-wiring): `RunRequest.tests[].assert`が
 * 指定されている場合、`lib/runner/grader.ts`の`evaluateAssert`(equals/deepEquals/
 * oneOf/matches)で判定する。従来の内蔵`deepEquals`+`expected`比較はequals/
 * deepEquals相当の判定しかできず、oneOf/matchesは`lib/lab/buildRunRequest.ts`が
 * `UnsupportedExerciseTestCaseError`を投げて弾いていた(=採点器`grader.ts`の
 * oneOf/matches実装が実Workerパスに一切配線されていなかった)。`assert`未指定時は
 * 既存の`expected`ベース判定に完全フォールバックする(後方互換)。
 */

// tsconfig の lib に webworker を含めていない(dom libとの型衝突を避けるため)ので
// worker専用グローバルはローカルに最小限のインターフェースとしてキャストする。
// self ではなく globalThis を使う(仕様上 self は worker スコープでは
// globalThis のエイリアスであり、かつ globalThis は Node 上でも常に存在するため
// このファイルを素の Node(Vitest)から安全にimportできる)。
type WorkerScope = {
  postMessage: (message: RunResult) => void;
  onmessage: ((event: { data: RunRequest }) => void) | null;
};

const ctx = globalThis as unknown as WorkerScope;

/**
 * 禁止トークン検出(02§7.1 手順1)。
 * 単純な部分一致ではなく呼び出し形/単語境界で判定する(※テンプレ許可制:
 * `prefetchData` のような無関係な識別子や、コメント中の言及を誤検知しない)。
 *
 * T-705(findings.md Critical/High対応): 静的検出は多層防御の1層目に過ぎず、
 * 単独では回避可能(ブラケット表記・間接呼び出し等)なため、真の防御は
 * `disableDangerousGlobals`のプロトタイプチェーン走査と
 * `neutralizeFunctionConstructorBacklinks`が担う。ここでの追加ルールは
 * 既知の回避パターンを早期に拒否し利用者に明確なエラーを返すための
 * 補助的なレイヤー。
 */
const FORBIDDEN_TOKEN_RULES: { token: string; pattern: RegExp }[] = [
  { token: "importScripts", pattern: /\bimportScripts\b/ },
  { token: "fetch", pattern: /\bfetch\s*\(/ },
  { token: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { token: "WebSocket", pattern: /\bWebSocket\b/ },
  { token: "indexedDB", pattern: /\bindexedDB\b/ },
  { token: "Atomics.wait", pattern: /\bAtomics\s*\.\s*wait\b/ },
  { token: "eval", pattern: /\beval\s*\(/ },
  { token: "indirect eval", pattern: /\(\s*0\s*,\s*eval\s*\)/ },
  { token: "new Function", pattern: /\bnew\s+Function\b/ },
  { token: "Function", pattern: /\bFunction\s*\(/ },
  { token: "constructor.constructor", pattern: /\.constructor\s*\.\s*constructor\b/ },
  { token: "new Worker", pattern: /\bnew\s+Worker\b/ },
  { token: "Worker", pattern: /\bWorker\s*\(/ },
  { token: "import()", pattern: /\bimport\s*\(/ },
];

export function checkForbiddenTokens(code: string): string | null {
  for (const rule of FORBIDDEN_TOKEN_RULES) {
    if (rule.pattern.test(code)) {
      return `禁止された構文が含まれています: ${rule.token}`;
    }
  }
  return null;
}

/**
 * 無効化対象のグローバルキー(T-705、findings.md Critical SB-1/SB-2/SB-4対応)。
 * fetch/XMLHttpRequest/WebSocket/importScriptsに加え、`new Worker(...)`による
 * ネストWorker経由の回避(findings.md #1関連事項)を塞ぐためWorkerも対象にし、
 * ADR-010 §3.1の記述誤り(findings.md #6, SB-7)を是正するためindexedDBも追加する。
 * eval/Functionもここで一元的に扱うことで、`(0, eval)(...)`や
 * `Function("return this")()`のような識別子解決経由の回避(findings.md #2, SB-3)も
 * 同じ機構(下記`neutralizeGlobalKey`)で閉じる。
 */
const DANGEROUS_GLOBAL_KEYS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "Worker",
  "indexedDB",
  "eval",
  "Function",
] as const;

/**
 * `[].constructor.constructor(...)`のようにグローバル識別子を一切参照せず
 * Function相当のコンストラクタへ到達する経路(findings.md #2)を閉じるため、
 * 4つの関数系統(通常関数/ジェネレータ/async関数/asyncジェネレータ)の
 * prototype.constructorバックリンクを無効化する。ユーザーコード実行**前**に
 * (=まだ何も無効化していない状態で)構文で直接取得するため、globalThisの
 * `Function`識別子ルックアップに依存しない。
 */
const FUNCTION_SPECIES_PROTOTYPES: object[] = [
  Object.getPrototypeOf(function () {}) as object,
  Object.getPrototypeOf(function* () {}) as object,
  Object.getPrototypeOf(async function () {}) as object,
  Object.getPrototypeOf(async function* () {}) as object,
];

function collectPrototypeChain(root: object): object[] {
  const chain: object[] = [];
  let current: object | null = root;
  while (current) {
    chain.push(current);
    current = Object.getPrototypeOf(current) as object | null;
  }
  return chain;
}

/**
 * `chain`中の**全ての階層**で`key`をown propertyとして無効化し、復元関数を返す。
 * 従来実装(`ctx[key] = undefined`)は`ctx`自身にshadowing用のown propertyを
 * 新規作成するだけで、prototype上(実ブラウザのWorkerGlobalScope.prototype等)に
 * 残る元の実装には触れられなかった(findings.md #1の原因そのもの)。
 * ここでは`Object.getOwnPropertyDescriptor`で実際に定義されている階層を特定し、
 * その階層自体を書き換える。
 */
function neutralizeGlobalKey(chain: object[], key: string): () => void {
  const restorers: (() => void)[] = [];
  for (const target of chain) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor) continue;
    if (descriptor.configurable) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        writable: true,
        value: undefined,
      });
      restorers.push(() => Object.defineProperty(target, key, descriptor));
    } else if (descriptor.writable) {
      const original = (target as Record<string, unknown>)[key];
      (target as Record<string, unknown>)[key] = undefined;
      restorers.push(() => {
        (target as Record<string, unknown>)[key] = original;
      });
    }
    // configurable:false かつ writable:false は通常発生しない(組み込みグローバルは
    // 通常configurable)。この場合は無効化不能だが、そのようなプロパティは存在しない。
  }
  return () => {
    for (const restore of restorers.reverse()) restore();
  };
}

function neutralizeFunctionConstructorBacklinks(): () => void {
  const restorers: (() => void)[] = [];
  for (const proto of FUNCTION_SPECIES_PROTOTYPES) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, "constructor");
    if (!descriptor || !descriptor.configurable) continue;
    Object.defineProperty(proto, "constructor", {
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true,
      value: undefined,
    });
    restorers.push(() => Object.defineProperty(proto, "constructor", descriptor));
  }
  return () => {
    for (const restore of restorers.reverse()) restore();
  };
}

/**
 * 危険なグローバルの無効化(02§7.1 手順2)。
 * T-705(findings.md Critical #1/#2対応、恒久対策): 単純なown property上書きは
 * 「prototypeチェーン上の元の実装は無傷のまま残る」という穴があった
 * (実ブラウザのWorkerGlobalScope.prototype.fetch等)。`globalThis`自身を起点に
 * プロトタイプチェーン全体を辿り、各対象キーが実際に定義されている**その階層**を
 * 直接書き換えることで、`Object.getPrototypeOf(self).fetch`・
 * `self.constructor.prototype.fetch`・`Reflect.get`等どの経路で参照しても
 * 元の実装へ到達できないようにする。加えてFunctionコンストラクタへの
 * `.constructor.constructor`経由の到達(識別子`Function`/`eval`を一切使わない
 * 回避)も同時に閉じる。復元関数を返す。
 */
function disableDangerousGlobals(): () => void {
  const chain = collectPrototypeChain(ctx as unknown as object);
  const restoreKeys = DANGEROUS_GLOBAL_KEYS.map((key) => neutralizeGlobalKey(chain, key));
  const restoreConstructorBacklinks = neutralizeFunctionConstructorBacklinks();
  return () => {
    restoreConstructorBacklinks();
    for (const restore of restoreKeys.reverse()) restore();
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

    const entryFn = moduleExports[request.entry];
    if (typeof entryFn !== "function") {
      return truncateResult({
        result: "error",
        error: `エクスポート関数 "${request.entry}" が見つかりません`,
        logs,
        durationMs: Date.now() - start,
      });
    }

    const perTest: RunPerTestResult[] = request.tests.map((test) => {
      const fnName = test.fn ?? request.entry;
      const fn = fnName === request.entry ? entryFn : moduleExports[fnName];
      if (typeof fn !== "function") {
        return { id: test.id, pass: false, error: `エクスポート関数 "${fnName}" が見つかりません` };
      }
      try {
        const actual = (fn as (...args: unknown[]) => unknown)(...test.args);
        if (test.assert) {
          const outcome = evaluateAssert(test.assert, actual);
          return {
            id: test.id,
            pass: outcome.pass,
            actual: safeStringify(actual),
            error: outcome.error ?? outcome.diff,
          };
        }
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
