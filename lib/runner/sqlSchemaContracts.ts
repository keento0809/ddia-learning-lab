import type { SqlValue } from "@/lib/runner/sqlContracts";

/**
 * スキーマビューア(02§4.2「SQL演習: エディタ下にスキーマビューア(sql.jsの
 * テーブル一覧+サンプル行)を追加表示」)専用Worker(sqlSchemaHarness.worker.ts)⇄
 * メインスレッド(sqlSchemaRunner.ts)間のpostMessageコントラクト。
 *
 * T-201の採点用コントラクト(sqlContracts.ts)とは目的が異なる(採点ではなく、
 * setupSql投入直後のテーブル一覧+サンプル行の表示専用)ため独立した型として
 * 定義する。lib/contracts/ 配下ではないため変更禁止の対象外。
 */

export type SqlTableSchema = {
  name: string;
  columns: string[];
  sampleRows: SqlValue[][];
};

export type SqlSchemaRequest = {
  /** スキーマ+シードデータ投入用SQL(ExerciseDefinition.entryを読み替えた値)。 */
  setupSql: string;
};

export type SqlSchemaResult =
  | { result: "ok"; tables: SqlTableSchema[] }
  | { result: "error"; error: string };
