import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    // S-01ランディング(app/[locale]/page.tsx)はT-101等の後続タスク未実装のため、
    // "/" はredirect先の "/en" が404になる。readinessチェックには実在する
    // /en/demo を使う(baseURLは相対パス解決用に維持)。
    url: "http://127.0.0.1:3100/en/demo",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
