import { test, expect } from "@playwright/test";

/**
 * 回帰テスト: ヘッダーのアカウント表示(components/layout/AccountMenu.tsx)。
 *
 * PROMPT_HEADER_AVATARで、未ログイン時の導線を「アカウント」ボタン→
 * ドロップダウンを開く→「ログイン」を選ぶという2段階から、ヘッダー上に
 * 直接クリック可能な「ログイン」リンクへ変更した(ドロップダウンを介さず
 * 1クリックでサインイン画面へ遷移する)。遷移先URL自体は変更していない
 * (/auth/signin)。
 *
 * ログイン済み状態(アバター表示・クリックで既存ドロップダウンが開くこと)は
 * 本ファイルでは検証しない: ログインにはCredentials検証(worker-api経由、
 * dispatchToWorkerApi)が必要だが、`next dev`はCloudflare Service Bindingを
 * エミュレートできず(2026-07-31付「next devはService Bindingをエミュレート
 * できない」決定事項、`npm run test:e2e`が使うwebServerは`next dev`)、この
 * 構成では サインアップ/サインインが503で必ず失敗する。ログイン済み時の
 * トリガー要素の切替(アバターのprops)・ドロップダウンの中身(設定・ログアウト)
 * 不変であることはtests/unit/layout/AccountMenu.test.tsxがworker-api非依存で
 * 検証し、実ブラウザでのアバター表示・クリック開閉は`npm run preview`
 * (実workerd)で手動確認する。
 */

test("未ログイン時: ヘッダー上の「ログイン」がドロップダウンを介さず1クリックでサインイン画面へ遷移する(404にならない)", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/en/demo");

  // ドロップダウンのトリガー(「アカウントメニューを開く」ボタン)はもう存在しない。
  await expect(
    page.getByRole("button", { name: "Open account menu", exact: true }),
  ).toHaveCount(0);

  const signInLink = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(signInLink).toBeVisible();

  await signInLink.click();

  // /en/auth/signinの並列実行下オンデマンドコンパイル(初回アクセス)がtoHaveURLの
  // 既定タイムアウト(5s)を超えることがある(tests/e2e/labOfficialRoute.spec.ts:50-54と
  // 同じ既知のnext dev特性)。waitForURLで明示的に長いタイムアウトを与える。
  await page.waitForURL(/\/en\/auth\/signin$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
