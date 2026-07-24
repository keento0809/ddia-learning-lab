import type { SqlRunRequest } from "@/lib/runner/sqlContracts";

/**
 * T-201のブラウザ内Worker動作確認用ダミー演習定義。
 * lib/runner/exerciseFixture.ts(JSランナー、T-107c)と同じ位置付けで、
 * 本番の演習YAML読み込み(T-202、content/{ja,en}/**\/labs/*.yaml)は対象外。
 * usersテーブルを事後SELECTで検証する破壊的課題(DELETE)を題材にする
 * (02§7.3「破壊的検証: UPDATE/DELETE課題は実行後のテーブル状態をSELECTで検証」)。
 */

export const SETUP_SQL = `
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL);
INSERT INTO users (id, name, active) VALUES
  (1, 'alice', 0),
  (2, 'bob', 1),
  (3, 'carol', 1);
`;

export const VERIFY_QUERY = "SELECT id, name FROM users ORDER BY id";

export const TESTS: SqlRunRequest["tests"] = [
  {
    id: "t1",
    query: VERIFY_QUERY,
    expected: {
      columns: ["id", "name"],
      rows: [
        [2, "bob"],
        [3, "carol"],
      ],
    },
    comparison: "ordered",
  },
];

export const TIMEOUT_MS = 3000;

export const TEMPLATE_SQL: Record<"ja" | "en", string> = {
  ja: "-- active=0のユーザーを削除するDELETE文を書いてください\n",
  en: "-- Write a DELETE statement that removes users where active = 0\n",
};

export const SOLUTION_SQL = "DELETE FROM users WHERE active = 0;";

export const MISMATCH_SQL = "DELETE FROM users WHERE id = 3;";

export const SYNTAX_ERROR_SQL = "DELEET FROM users WHERE active = 0;";
