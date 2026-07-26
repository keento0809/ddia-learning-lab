import { test, expect } from "@playwright/test";

// 03文書T-302受入基準「1シナリオ完走のE2Eテスト」。
// キャップストーン画面(/en/learn/capstone)で3つの設計判断を全て選択し、
// 分岐評価結果(verdict/score/feedback)が表示されるところまでを1本で検証する。
test("completes the capstone scenario end-to-end and reaches the optimal branch", async ({
  page,
}) => {
  await page.goto("/en/learn/capstone");

  await expect(page.getByRole("heading", { name: "Capstone: Branching Scenario" })).toBeVisible();

  const submitButton = page.getByTestId("capstone-submit");
  await expect(submitButton).toBeDisabled();
  await expect(page.getByTestId("capstone-result")).toHaveCount(0);

  // 最適分岐(optimal-leaderless-hash-eventual)になる組み合わせを選択する。
  await page
    .getByTestId("capstone-decision-replication")
    .getByRole("radio", { name: /Leaderless/ })
    .check();
  await page
    .getByTestId("capstone-decision-partitioning")
    .getByRole("radio", { name: /Hash partitioning/ })
    .check();
  await page
    .getByTestId("capstone-decision-consistency")
    .getByRole("radio", { name: /Eventual consistency/ })
    .check();

  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  const result = page.getByTestId("capstone-result");
  await expect(result).toBeVisible();
  await expect(page.getByTestId("capstone-result-verdict")).toHaveText("Optimal");
  await expect(result).toContainText("Score: 95/100");
  await expect(result).toContainText("best fit for these requirements");

  // やり直すと選択と結果がリセットされる。
  await page.getByTestId("capstone-reset").click();
  await expect(page.getByTestId("capstone-result")).toHaveCount(0);
  await expect(submitButton).toBeDisabled();
});

// パーティションなし(単一ノード)は他の選択に関わらず"broken"分岐になることを検証する
// (分岐評価エンジンの優先度: より具体的な条件よりもこのブロッカーを先に評価する)。
test("reaches the broken branch when partitioning is set to none, regardless of other choices", async ({
  page,
}) => {
  await page.goto("/en/learn/capstone");

  await page
    .getByTestId("capstone-decision-replication")
    .getByRole("radio", { name: /Leaderless/ })
    .check();
  await page
    .getByTestId("capstone-decision-partitioning")
    .getByRole("radio", { name: "No partitioning (single node)" })
    .check();
  await page
    .getByTestId("capstone-decision-consistency")
    .getByRole("radio", { name: /Eventual consistency/ })
    .check();

  await page.getByTestId("capstone-submit").click();

  await expect(page.getByTestId("capstone-result-verdict")).toHaveText("Broken");
});

// qa-evaluator指摘: 01基本設計書F-08「言語切替(1クリック、状態保持)」。
// 選択途中で言語トグルを押しても、選択内容(capstoneStore、Zustand)が
// 保持されることを実際のヘッダーUI操作で検証する。
test("keeps the selection when the language toggle is used mid-scenario (F-08 state preservation)", async ({
  page,
}) => {
  await page.goto("/en/learn/capstone");

  await page
    .getByTestId("capstone-decision-replication")
    .getByRole("radio", { name: /Leaderless/ })
    .check();
  await page
    .getByTestId("capstone-decision-partitioning")
    .getByRole("radio", { name: /Hash partitioning/ })
    .check();

  await page.getByRole("button", { name: "Switch display language" }).click();
  await expect(page).toHaveURL(/\/ja\/learn\/capstone/);

  await expect(
    page.getByTestId("capstone-decision-replication").getByRole("radio", { name: /リーダーレス/ }),
  ).toBeChecked();
  await expect(
    page.getByTestId("capstone-decision-partitioning").getByRole("radio", { name: /ハッシュ分割/ }),
  ).toBeChecked();

  // 3軸目(consistency)を選ぶと送信でき、結果は最適分岐になる。
  await page
    .getByTestId("capstone-decision-consistency")
    .getByRole("radio", { name: /結果整合性/ })
    .check();
  await page.getByTestId("capstone-submit").click();
  await expect(page.getByTestId("capstone-result-verdict")).toHaveText("最適");
});
