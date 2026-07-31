import { test, expect, type Page } from "@playwright/test";

/**
 * T-108r 受入基準(10)「Playwright: 目次→演習遷移→合格 のE2E1本」。
 * `tests/e2e/labWorkspace.spec.ts`(`/lab-preview`固定演習)とは異なり、
 * 実際のモジュール詳細ページ(S-03, `/learn/[module]`)の目次リンクから
 * 本番ルート(`/learn/[module]/lab/[exercise]`, T-108r)へ遷移し、
 * content/ja/05-replication/labs/quorum-lab.yamlの実演習で合格まで検証する。
 * Monaco操作の手法(`window.monaco.editor.getEditors()[0].setValue`+
 * localStorage draftのポーリング)は`labWorkspace.spec.ts`の失敗→恒久対策を
 * そのまま踏襲する。
 */
const SOLUTION_CODE = `export function hasQuorumOverlap(n, w, r) {
  return w + r > n;
}
`;

async function typeQuorumSolution(page: Page) {
  const draftKey = "draft:05-replication/quorum-lab:ja";

  await expect(async () => {
    await page.evaluate((code) => {
      const w = window as unknown as { monaco?: { editor: { getEditors(): { setValue(v: string): void }[] } } };
      const editor = w.monaco?.editor.getEditors()[0];
      if (!editor) throw new Error("Monaco editor instance not yet available");
      editor.setValue(code);
    }, SOLUTION_CODE);
    await expect(page.getByTestId("lab-code-editor")).toContainText("return w + r > n;", {
      timeout: 1000,
    });
    await expect(page.getByTestId("lab-autosave-indicator")).toHaveText(/保存中|Saving/, { timeout: 800 });
  }).toPass({ timeout: 15_000 });

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey), { timeout: 15_000 })
    .toContain("return w + r > n;");
}

test("目次→演習遷移→合格", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico")) consoleErrors.push(msg.text());
  });

  await page.goto("/ja/learn/05-replication");
  const exerciseLink = page.getByTestId("module-toc-exercise-05-replication/quorum-lab");
  await expect(exerciseLink).toHaveAttribute("href", "/ja/learn/05-replication/lab/quorum-lab");
  await exerciseLink.click();

  // 失敗→恒久対策: 演習ページは(モジュール詳細ページと違い)このテストで初めて
  // 訪問するルートのため、Next.js dev serverのオンデマンドコンパイル
  // (初回アクセス時のみ発生)が並列実行下の負荷次第でtoHaveURLの既定タイムアウト
  // (5s)を超えることがあった。`waitForURL`で明示的に長いタイムアウトを与える。
  await page.waitForURL(/\/ja\/learn\/05-replication\/lab\/quorum-lab$/, { timeout: 20_000 });
  await expect(page.getByTestId("lab-workspace")).toBeVisible();
  await expect(page.getByTestId("lab-code-editor")).toContainText("TODO");

  await typeQuorumSolution(page);
  await page.getByTestId("lab-run-button").click();

  await expect(page.getByTestId("lab-status-label")).toHaveText("合格");
  await expect(page.getByTestId("lab-result-body")).toContainText("6/6 件のテストに合格");

  expect(consoleErrors).toEqual([]);
});
