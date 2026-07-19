import { test, expect } from "@playwright/test";

// T-107c 受入基準: 「while(true){}を渡すと5.5s以内にtimeout結果が返り、Workerが残存しない」
// 実Workerのterminate挙動はブラウザでしか検証できないため、Vitestではなく
// Playwright(実ブラウザ)で結合テストする。
test("infinite loop code times out within 5.5s and leaves no worker behind", async ({ page }) => {
  await page.goto("/en/demo");

  await page.getByRole("button", { name: "Load infinite loop" }).click();
  await expect(page.getByTestId("lab-code-editor")).toHaveValue(/while \(true\)/);

  const start = Date.now();
  await page.getByRole("button", { name: "Run", exact: true }).click();

  await expect(page.getByTestId("lab-result-status")).toContainText("Timed out", {
    timeout: 5500,
  });
  expect(Date.now() - start).toBeLessThanOrEqual(5500);

  // Workerのterminate()が実際に呼ばれ、ページ上にWorkerが残存していないことを確認する。
  await expect.poll(() => page.workers().length).toBe(0);
});

test("normal code passes and a runtime exception in user code is reported as a failed test", async ({ page }) => {
  await page.goto("/en/demo");

  await page.getByRole("button", { name: "Load correct solution" }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("lab-result-status")).toContainText("Pass");
  await expect.poll(() => page.workers().length).toBe(0);

  await page.getByTestId("lab-code-editor").fill("export function sum(numbers) { throw new Error('boom'); }");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("lab-result-status")).toContainText("Fail");
  await expect.poll(() => page.workers().length).toBe(0);
});
