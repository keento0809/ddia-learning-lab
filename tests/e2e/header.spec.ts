import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// T-007 受入基準(5): キーボードのみでヘッダ全操作が可能なことを検証する1本。
test("キーボードのみでヘッダの全操作が完結する", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/en/demo");
  const header = page.locator("header");
  await expect(header).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "DDIA Learning Lab", exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "Learn", exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "Glossary", exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "Search", exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  const localeToggle = header.getByRole("button", { name: "Switch display language", exact: true });
  await expect(localeToggle).toBeFocused();

  await page.keyboard.press("Tab");
  const themeToggle = header.getByRole("button", { name: "Switch to dark theme", exact: true });
  await expect(themeToggle).toBeFocused();
  await expect(themeToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.keyboard.press("Enter");
  await expect(
    header.getByRole("button", { name: "Switch to light theme", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.keyboard.press("Tab");
  const accountTrigger = header.getByRole("button", { name: "Open account menu", exact: true });
  await expect(accountTrigger).toBeFocused();

  await page.keyboard.press("Enter");
  const settingsItem = page.getByRole("menuitem", { name: "Settings", exact: true });
  await expect(settingsItem).toBeVisible();
  await expect(settingsItem).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Sign in", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(settingsItem).toBeHidden();
  await expect(accountTrigger).toBeFocused();

  expect(consoleErrors).toEqual([]);
});

// T-007 受入基準(4): axe自動チェックで重大違反0であることを検証する。
// スキャン対象はT-007成果物(Header/Footer/404ページ)に限定する。/en/demoの
// 本文(Lab/エディタ)はT-000 Walking Skeletonの使い捨て成果物でT-007のスコープ外
// のため、Header/Footer領域のみをinclude()で対象化する。
test("axe自動チェックで重大違反が0件である(Header/Footer)", async ({ page }) => {
  await page.goto("/en/demo");
  const results = await new AxeBuilder({ page }).include("header").include("footer").analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});

test("axe自動チェックで重大違反が0件である(404ページ)", async ({ page }) => {
  await page.goto("/en/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
});
