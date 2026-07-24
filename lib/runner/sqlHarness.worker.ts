import type initSqlJsFactory from "sql.js";
import { compareResultSets } from "@/lib/runner/sqlCompare";
import type {
  SqlPerTestResult,
  SqlResultSet,
  SqlRunRequest,
  SqlRunResult,
} from "@/lib/runner/sqlContracts";

/**
 * SQLサンドボックス実行ハーネス(T-201、02§7.3)。
 * harness.worker.ts(T-107a、JSランナー)と同じくWorkerスコープ専用グローバルは
 * ローカルの最小インターフェースとしてキャストし、モジュールロード手段
 * (ここでは sql.js の初期化)を差し替え可能にすることでNode上のVitestから
 * 純粋関数として検証できるようにしてある(実運用の worker スコープ配線は
 * 末尾の `ctx.onmessage` のみが担う)。
 *
 * JSランナーと異なり禁止トークン検出・危険グローバル無効化は行わない
 * (ユーザー入力は任意JSではなくSQL文字列であり、sql.js/SQLite自体が
 * 実行サンドボックスとなるため、02§7.3にもその種の対策は定義されていない)。
 */

type WorkerScope = {
  postMessage: (message: SqlRunResult) => void;
  onmessage: ((event: { data: SqlRunRequest }) => void) | null;
};

const ctx = globalThis as unknown as WorkerScope;

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJsFactory>>;
type SqlDatabase = InstanceType<SqlJsStatic["Database"]>;

/**
 * sql.jsロード(02§7.3「sql.js(SQLite WASM)をWorker内でロード」)。
 * 既定値はブラウザ向け(`locateFile`で同一オリジン配信されるWASM資産
 * `public/generated/`を参照、CDNへは問い合わせない。scripts/copy-sql-wasm.mjs
 * 参照)。Node(Vitest)では`sql.js`パッケージ既定のfs解決で足りるため、
 * テスト側で`deps.loadSqlJs`にデフォルト`initSqlJs()`を注入して検証する。
 */
async function loadSqlJsForWorker(): Promise<SqlJsStatic> {
  const initSqlJs = (await import("sql.js")).default;
  return initSqlJs({
    locateFile: (file: string) => `/generated/${file}`,
  });
}

export type SqlHarnessDeps = {
  loadSqlJs?: () => Promise<SqlJsStatic>;
};

function execResultToResultSet(execResult: ReturnType<SqlDatabase["exec"]>): SqlResultSet {
  const first = execResult[0];
  return { columns: first?.columns ?? [], rows: first?.values ?? [] };
}

export async function runSqlHarness(
  request: SqlRunRequest,
  deps: SqlHarnessDeps = {},
): Promise<SqlRunResult> {
  const loadSqlJs = deps.loadSqlJs ?? loadSqlJsForWorker;
  const start = Date.now();

  let SQL: SqlJsStatic;
  try {
    SQL = await loadSqlJs();
  } catch (e) {
    return {
      result: "error",
      error: `sql.jsの初期化に失敗しました: ${String(e)}`,
      durationMs: Date.now() - start,
    };
  }

  const db: SqlDatabase = new SQL.Database();
  try {
    try {
      db.run(request.setupSql);
    } catch (e) {
      return {
        result: "error",
        error: `セットアップSQLの実行に失敗しました: ${String(e)}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      db.run(request.userSql);
    } catch (e) {
      return {
        result: "error",
        error: String(e),
        durationMs: Date.now() - start,
      };
    }

    const perTest: SqlPerTestResult[] = request.tests.map((test) => {
      try {
        const actual = execResultToResultSet(db.exec(test.query));
        const outcome = compareResultSets(test.expected, actual, test.comparison);
        return { id: test.id, pass: outcome.pass, actual, diff: outcome.diff };
      } catch (e) {
        return { id: test.id, pass: false, error: String(e) };
      }
    });

    const allPass = perTest.every((t) => t.pass);
    return {
      result: allPass ? "pass" : "fail",
      perTest,
      durationMs: Date.now() - start,
    };
  } finally {
    db.close();
  }
}

/**
 * タイムアウトの二重化(02§7.1と同様の構成をSQLランナーにも適用)のうちWorker側の担当分。
 * sql.jsの実行は同期的なため、同期的に無限ループするSQL(例: 巨大な直積を伴うJOIN)は
 * このタイマー自体が発火せず捕捉できない。その場合はメインスレッド側sqlRunner.tsの
 * 強制terminateが最終防衛線となる(jsRunner.tsと同じ制約、harness.worker.ts参照)。
 */
export function createOnMessageHandler(
  deps: SqlHarnessDeps = {},
  postMessage: (message: SqlRunResult) => void = (message) => ctx.postMessage(message),
): (event: { data: SqlRunRequest }) => void {
  return (event) => {
    const request = event.data;
    let responded = false;

    const internalTimeout = setTimeout(() => {
      if (responded) return;
      responded = true;
      postMessage({ result: "timeout", durationMs: request.timeoutMs });
    }, request.timeoutMs);

    void runSqlHarness(request, deps).then((result) => {
      if (responded) return;
      responded = true;
      clearTimeout(internalTimeout);
      postMessage(result);
    });
  };
}

ctx.onmessage = createOnMessageHandler();
