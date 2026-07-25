import type initSqlJsFactory from "sql.js";
import type { SqlValue } from "@/lib/runner/sqlContracts";
import type { SqlSchemaRequest, SqlSchemaResult, SqlTableSchema } from "@/lib/runner/sqlSchemaContracts";

/**
 * スキーマビューア専用Worker(02§4.2、T-202)。setupSqlを投入した直後のDBから
 * テーブル一覧+列名+サンプル行を読み取るだけで、採点は行わない
 * (採点はT-201のsqlHarness.worker.ts/sqlRunner.tsが別Workerとして担当)。
 *
 * sqlHarness.worker.ts(T-201、変更禁止)はモジュール末尾で`ctx.onmessage`を
 * 設定する副作用を持つため、そこから初期化ロジックだけをimportして再利用すると
 * 同一Workerスコープに2つのハンドラを紐づけようとして採点用の配線まで巻き込む
 * ことになる。そのため sql.js 初期化コードは本ファイルに独立して複製する
 * (意図的な重複、対象ファイルが不可変のための回避策)。
 */

type WorkerScope = {
  postMessage: (message: SqlSchemaResult) => void;
  onmessage: ((event: { data: SqlSchemaRequest }) => void) | null;
};

const ctx = globalThis as unknown as WorkerScope;

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJsFactory>>;
type SqlDatabase = InstanceType<SqlJsStatic["Database"]>;

async function loadSqlJsForWorker(): Promise<SqlJsStatic> {
  const initSqlJs = (await import("sql.js")).default;
  return initSqlJs({
    locateFile: (file: string) => `/generated/${file}`,
  });
}

export type SqlSchemaHarnessDeps = {
  loadSqlJs?: () => Promise<SqlJsStatic>;
};

const SAMPLE_ROW_LIMIT = 5;

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function runSqlSchemaHarness(
  request: SqlSchemaRequest,
  deps: SqlSchemaHarnessDeps = {},
): Promise<SqlSchemaResult> {
  const loadSqlJs = deps.loadSqlJs ?? loadSqlJsForWorker;

  let SQL: SqlJsStatic;
  try {
    SQL = await loadSqlJs();
  } catch (e) {
    return { result: "error", error: `sql.jsの初期化に失敗しました: ${String(e)}` };
  }

  const db: SqlDatabase = new SQL.Database();
  try {
    try {
      db.run(request.setupSql);
    } catch (e) {
      return { result: "error", error: `セットアップSQLの実行に失敗しました: ${String(e)}` };
    }

    try {
      const tableNamesResult = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
      const tableNames = (tableNamesResult[0]?.values ?? []).map((row) => String(row[0]));

      const tables: SqlTableSchema[] = tableNames.map((name) => {
        const columnsResult = db.exec(`PRAGMA table_info(${quoteIdentifier(name)})`);
        const columns = (columnsResult[0]?.values ?? []).map((row) => String(row[1]));
        const sampleResult = db.exec(`SELECT * FROM ${quoteIdentifier(name)} LIMIT ${SAMPLE_ROW_LIMIT}`);
        const sampleRows = (sampleResult[0]?.values ?? []) as SqlValue[][];
        return { name, columns, sampleRows };
      });

      return { result: "ok", tables };
    } catch (e) {
      return { result: "error", error: `スキーマの取得に失敗しました: ${String(e)}` };
    }
  } finally {
    db.close();
  }
}

export function createOnMessageHandler(
  deps: SqlSchemaHarnessDeps = {},
  postMessage: (message: SqlSchemaResult) => void = (message) => ctx.postMessage(message),
): (event: { data: SqlSchemaRequest }) => void {
  return (event) => {
    void runSqlSchemaHarness(event.data, deps).then(postMessage);
  };
}

ctx.onmessage = createOnMessageHandler();
