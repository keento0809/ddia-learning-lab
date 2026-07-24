import type { SqlComparisonMode, SqlResultSet, SqlValue } from "@/lib/runner/sqlContracts";

/**
 * 結果集合の比較(02§7.3「expected(結果集合)と順序無視/順序考慮を指定して比較」)。
 * sql.jsの挙動として、SELECTが0行を返すとexec()は列情報を含まない空配列を返す
 * (実測で確認済み)ため、actualが0行のときは列名を比較対象から除外する。
 */

function normalizeValue(value: SqlValue): string {
  if (value instanceof Uint8Array) {
    return `blob:${Array.from(value).join(",")}`;
  }
  return JSON.stringify(value);
}

function normalizeRow(row: SqlValue[]): string {
  return row.map(normalizeValue).join("");
}

export type SqlCompareOutcome = { pass: boolean; diff?: string };

export function compareResultSets(
  expected: SqlResultSet,
  actual: SqlResultSet,
  mode: SqlComparisonMode,
): SqlCompareOutcome {
  const actualColumnsUnknown = actual.rows.length === 0 && actual.columns.length === 0;
  if (!actualColumnsUnknown) {
    const columnsMatch =
      expected.columns.length === actual.columns.length &&
      expected.columns.every((c, i) => c === actual.columns[i]);
    if (!columnsMatch) {
      return {
        pass: false,
        diff: `列が一致しません: expected [${expected.columns.join(", ")}], actual [${actual.columns.join(", ")}]`,
      };
    }
  }

  if (expected.rows.length !== actual.rows.length) {
    return {
      pass: false,
      diff: `行数が一致しません: expected ${expected.rows.length}件, actual ${actual.rows.length}件`,
    };
  }

  if (mode === "ordered") {
    for (let i = 0; i < expected.rows.length; i++) {
      if (normalizeRow(expected.rows[i]) !== normalizeRow(actual.rows[i])) {
        return {
          pass: false,
          diff: `${i}行目が一致しません: expected ${JSON.stringify(expected.rows[i])}, actual ${JSON.stringify(actual.rows[i])}`,
        };
      }
    }
    return { pass: true };
  }

  const expectedSorted = expected.rows.map(normalizeRow).sort();
  const actualSorted = actual.rows.map(normalizeRow).sort();
  for (let i = 0; i < expectedSorted.length; i++) {
    if (expectedSorted[i] !== actualSorted[i]) {
      return {
        pass: false,
        diff: `結果集合が一致しません(順序無視): expected ${JSON.stringify(expected.rows)}, actual ${JSON.stringify(actual.rows)}`,
      };
    }
  }
  return { pass: true };
}
