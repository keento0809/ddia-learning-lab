import { test, expect } from "@playwright/test";

/**
 * 回帰テスト: ヘッダーのアカウントメニュー(components/layout/AccountMenu.tsx)。
 * 修正前は未ログイン時の「ログイン」項目が存在しない/auth(index)を指しており
 * page not foundになっていた(正しくは/auth/signin)。また未ログイン/ログイン済み
 * の両方で同一の2項目(設定・ログイン)を出しており、未ログイン時に「設定」を押すと
 * 認証必須ゆえサインインへ押し戻される体験だった。isAuthenticatedに応じて
 * 出す項目を1つに絞ったため、未ログイン時にクリック→正しい遷移先になることを
 * ここで検証する。
 *
 * ログイン済み状態のクリック回帰(設定への遷移)は本ファイルでは検証しない:
 * ログインにはCredentials検証(worker-api経由、dispatchToWorkerApi)が必要だが、
 * `next dev`はCloudflare Service Bindingをエミュレートできず
 * (2026-07-31付「next devはService Bindingをエミュレートできない」決定事項、
 * `npm run test:e2e`が使うwebServerは`next dev`)、この構成では
 * サインアップ/サインインが503で必ず失敗する。ログイン済み時の項目切替
 * (「設定」のみ表示・hrefが/settings)はtests/unit/layout/AccountMenu.test.tsxが
 * worker-api非依存で検証し、実ブラウザでのログイン済みクリック遷移は
 * `npm run preview`(実workerd)で手動確認する。
 */

test("未ログイン時: アカウントメニューの「ログイン」がサインイン画面へ遷移する(404にならない)", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/en/demo");
  await page.getByRole("button", { name: "Open account menu", exact: true }).click();

  const signInItem = page.getByRole("menuitem", { name: "Sign in", exact: true });
  await expect(signInItem).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toHaveCount(0);

  await signInItem.click();

  // /en/auth/signinの並列実行下オンデマンドコンパイル(初回アクセス)がtoHaveURLの
  // 既定タイムアウト(5s)を超えることがある(tests/e2e/labOfficialRoute.spec.ts:50-54と
  // 同じ既知のnext dev特性)。waitForURLで明示的に長いタイムアウトを与える。
  await page.waitForURL(/\/en\/auth\/signin$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
