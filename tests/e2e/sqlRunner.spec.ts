import { test, expect } from "@playwright/test";

// T-201受入基準: sql.jsがWorker内でロードされ(同一オリジン配信設定含む)、
// setupSql投入→ユーザーSQL実行→結果集合比較が実ブラウザで動作すること。
// 実Workerでの同一オリジンWASM資産読み込みはブラウザでしか検証できないため、
// Vitestではなく Playwright(実ブラウザ)で結合テストする。
test("correct SQL passes and an incorrect DELETE is reported as a failed test", async ({ page }) => {
  await page.goto("/en/demo");

  await page.getByRole("button", { name: "Load correct SQL" }).click();
  await page.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(page.getByTestId("sql-lab-result-status")).toContainText("Pass");
  await expect.poll(() => page.workers().length).toBe(0);

  await page.getByRole("button", { name: "Load incorrect SQL" }).click();
  await page.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(page.getByTestId("sql-lab-result-status")).toContainText("Fail");
  await expect.poll(() => page.workers().length).toBe(0);
});

test("a SQL syntax error is reported as an error result", async ({ page }) => {
  await page.goto("/en/demo");

  await page.getByRole("button", { name: "Load SQL with a syntax error" }).click();
  await page.getByRole("button", { name: "Run SQL", exact: true }).click();
  await expect(page.getByTestId("sql-lab-result-status")).toContainText("Error");
  await expect.poll(() => page.workers().length).toBe(0);
});
