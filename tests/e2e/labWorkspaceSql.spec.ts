import { test, expect, type Page } from "@playwright/test";

/**
 * T-202受入基準「Playwright: SQL演習の合格フロー1本が合格」。
 * `/[locale]/lab-preview-sql`(`lib/lab/demoSqlExercise.ts`)の固定演習で検証する
 * (content/への実演習投入前でもSQLモードのS-06を安定して検証するための専用ルート、
 * components/lab/LabWorkspace.tsx参照)。
 *
 * Monaco操作・自動保存待機の手法は`tests/e2e/labWorkspace.spec.ts`の
 * 「失敗→恒久対策」(1)〜(3)で確立済みの方式(window.monaco経由のsetValue+
 * localStorageポーリング+リトライブロック)をそのまま踏襲する(JS版と同じ
 * Monacoインタラクション基盤を使っているため、同一クラスのflakinessが
 * SQL演習でも起こりうる)。
 */
const SOLUTION_SQL = "DELETE FROM users WHERE active = 0;";

async function typeSqlSolution(page: Page) {
  const draftKey = "draft:lab-preview-sql-demo/delete-inactive-users:ja";

  await expect(async () => {
    await page.evaluate((code) => {
      const w = window as unknown as { monaco?: { editor: { getEditors(): { setValue(v: string): void }[] } } };
      const editor = w.monaco?.editor.getEditors()[0];
      if (!editor) throw new Error("Monaco editor instance not yet available");
      editor.setValue(code);
    }, SOLUTION_SQL);
    await expect(page.getByTestId("lab-code-editor")).toContainText("DELETE FROM users WHERE active = 0;", {
      timeout: 1000,
    });
    await expect(page.getByTestId("lab-autosave-indicator")).toHaveText(/保存中|Saving/, { timeout: 800 });
  }).toPass({ timeout: 15_000 });

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey), { timeout: 15_000 })
    .toContain("DELETE FROM users WHERE active = 0;");
}

test("SQL演習: コード入力→実行→合格表示", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico")) consoleErrors.push(msg.text());
  });

  await page.goto("/ja/lab-preview-sql");
  await expect(page.getByTestId("lab-workspace")).toBeVisible();
  await expect(page.getByTestId("lab-schema-viewer")).toBeVisible();
  await expect(page.getByTestId("lab-schema-table-users")).toBeVisible();

  await typeSqlSolution(page);
  await page.getByTestId("lab-run-button").click();

  await expect(page.getByTestId("lab-status-label")).toHaveText("合格");
  await expect(page.getByTestId("lab-result-body")).toContainText("1/1 件のテストに合格");
  await expect(page.getByTestId("lab-test-result-t1")).toContainText("✓");

  expect(consoleErrors).toEqual([]);
});
