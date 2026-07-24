"use client";

import { useEffect, useState } from "react";
import { runSqlSchemaExercise } from "@/lib/runner/sqlSchemaRunner";
import type { SqlTableSchema } from "@/lib/runner/sqlSchemaContracts";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * SQL演習用スキーマビューア(02§4.2「エディタ下にスキーマビューア
 * (sql.jsのテーブル一覧+サンプル行)を追加表示」)。setupSql投入直後のDB状態を
 * sqlSchemaRunner.ts経由の専用Workerで読み取り、表示専用に描画する
 * (採点そのものには関与しない)。
 */
type ViewerState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ok"; tables: SqlTableSchema[] };

export function SchemaViewer({ setupSql, locale }: { setupSql: string; locale: Locale }) {
  const t = getMessages(locale).labWorkspace.schemaViewer;
  const [state, setState] = useState<ViewerState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    runSqlSchemaExercise({ setupSql }).then((result) => {
      if (cancelled) return;
      setState(result.result === "ok" ? { status: "ok", tables: result.tables } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [setupSql]);

  return (
    <div
      data-testid="lab-schema-viewer"
      className="h-full overflow-y-auto border-t border-neutral-200 p-3 text-xs dark:border-neutral-800"
    >
      <h3 className="mb-2 font-medium">{t.heading}</h3>
      {state.status === "loading" && <p className="text-neutral-500">{t.loading}</p>}
      {state.status === "error" && (
        <p data-testid="lab-schema-viewer-error" className="text-red-600 dark:text-red-400">
          {`${t.error}: ${state.error}`}
        </p>
      )}
      {state.status === "ok" && state.tables.length === 0 && <p className="text-neutral-500">{t.noTables}</p>}
      {state.status === "ok" && state.tables.length > 0 && (
        <ul className="space-y-3">
          {state.tables.map((table) => (
            <li key={table.name} data-testid={`lab-schema-table-${table.name}`}>
              <div className="font-mono font-medium">{table.name}</div>
              <div className="text-neutral-500">{table.columns.join(", ")}</div>
              <div className="mt-1">
                <span className="text-neutral-500">{t.sampleRowsLabel}</span>
                {table.sampleRows.length === 0 ? (
                  <p className="text-neutral-500">{t.noSampleRows}</p>
                ) : (
                  <table className="mt-1 w-full border-collapse font-mono">
                    <thead>
                      <tr>
                        {table.columns.map((col) => (
                          <th key={col} className="border border-neutral-200 px-1 text-left dark:border-neutral-800">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.sampleRows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="border border-neutral-200 px-1 dark:border-neutral-800">
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
