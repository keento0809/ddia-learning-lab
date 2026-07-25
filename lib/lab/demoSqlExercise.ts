import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { Locale } from "@/lib/contracts/common";
import { SETUP_SQL, SOLUTION_SQL, TEMPLATE_SQL, TESTS, TIMEOUT_MS } from "@/lib/runner/sqlExerciseFixture";

/**
 * S-06 SQL演習ページ(T-202)のプレビュー/E2E検証用固定演習データ。
 * `lib/lab/demoExercise.ts`(T-108、JS版)と同じ設計判断(content/への実演習
 * データ投入前でもSQLモードのUIを安定検証するための固定データ、
 * `/[locale]/lab-preview-sql`からのみ参照)を踏襲する。
 *
 * 採点シナリオそのものはT-201検証済みの`lib/runner/sqlExerciseFixture.ts`
 * (usersテーブルへのDELETE課題)をそのまま流用し、`ExerciseDefinition`形式へ
 * 変換するだけに留める(新規のSQLシナリオを作らない)。
 *
 * `lib/lab/buildSqlRunRequest.ts`のドキュメント参照: `entry`をsetupSql、
 * `call.fn`を検証用SELECT文として読み替える(ExerciseDefinitionSchemaに
 * SQL専用フィールドが無いための既知の回避策)。equals形式のテストのみ使用する。
 */
export function getDemoSqlExercise(locale: Locale): ExerciseDefinition {
  return {
    slug: "lab-preview-sql-demo/delete-inactive-users",
    language: "sql",
    entry: SETUP_SQL,
    template: TEMPLATE_SQL[locale],
    tests: TESTS.map((test) => ({
      id: test.id,
      call: { fn: test.query, args: [] },
      assert: { type: "equals" as const, value: test.expected },
    })),
    timeoutMs: TIMEOUT_MS,
    hints: [
      { ja: "WHERE句でactive=0の行を絞り込みます", en: "Use a WHERE clause to filter rows where active = 0" },
      { ja: "DELETE FROM usersに続けてWHEREを書きます", en: "Write DELETE FROM users followed by a WHERE clause" },
    ],
  };
}

export const DEMO_SQL_EXERCISE_SOLUTION_CODE = SOLUTION_SQL;
