import { test, expect, type Page } from "@playwright/test";

/**
 * T-108受入基準(10)「Playwright: 「コード入力→実行→合格表示」
 * 「言語トグル→コードが保持されている」の2本」。
 * `/[locale]/lab-preview`(`lib/lab/demoExercise.ts`)の固定演習で検証する
 * (content/への実演習投入前でもS-06自体を安定して検証するための専用ルート、
 * components/lab/LabWorkspace.tsx参照)。
 */
const SOLUTION_CODE = `export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
`;

/**
 * 失敗→恒久対策(1): 当初`.view-lines`(描画層)や`.inputarea`(隠しtextarea)への
 * クリック+`page.keyboard`によるキー入力シミュレーションでコードを書き換える
 * 設計だったが、`npx playwright test`(headless CLI実行)ではフォーカスが
 * 確実にMonacoの入力捕捉要素へ移らず、select-allが効かないままテンプレート末尾
 * に新規コードが追記され`SyntaxError: Identifier 'clamp' has already been
 * declared`になる、または何も入力されない、という2種の再現性のある不具合が
 * あった(MCPの対話的ブラウザでは同じコードが安定して成功していたため、
 * headless CLIランナー固有の挙動と判断)。Monaco自身が`window.monaco`
 * (`@monaco-editor/react`のCDNローダが公開する標準API)経由で
 * `monaco.editor.getEditors()`を提供しているため、実エディタインスタンスへの
 * `setValue`(Monaco公式API、`onDidChangeModelContent`を発火させ`onChange`
 * 経由でReact状態にも正しく反映される)で確定的に内容を書き換える方式に変更した。
 *
 * 失敗→恒久対策(2): 上記(1)の修正後も並列実行(複数worker)下で低確率に
 * 「正解コードを入れたのに不合格になる」flakinessが再現した。原因は`setValue`
 * 直後にMonaco自身の描画層(`.view-lines`)は同期的に更新されるが、それを検知
 * した`onChange`→Reactの`setState`→zustandストア更新は1テック遅れることがあり、
 * CPU負荷が高い並列実行下ではその遅れが可視化されるほど広がることがある、
 * というレース状態だった。当初「自動保存インジケータが"保存中…"に変わって
 * from消えるまで待つ」という遷移待ちで対処したが、この遷移自体が(特に高負荷下で)
 * 一瞬すぎて`waitFor`が捕捉し損ねる新たなflakinessを生んだ(qa-evaluatorが
 * 再検証で検出)。UIの一時的な表示状態を待つのではなく、`onChange`→`setCode`→
 * 1s debounce→`writeDraft`(`lib/lab/draftStorage.ts`)という一連の処理の
 * **最終結果**であるlocalStorageの中身を直接ポーリングする方式に変更した。
 * これは「Reactの状態が実際に更新され、かつ1s debounceも完了した」ことを
 * 曖昧さなく確認できる(そもそも受入基準(6)のドラフト自動保存自体の検証も兼ねる)。
 *
 * 失敗→恒久対策(3): それでもごく低確率に、localStorageへの書き込みが
 * 15秒待っても一切現れない(単なる遅延ではなく、そもそも発生しない)ケースが
 * 残った。原因は、`monaco.editor.getEditors()`にエディタインスタンスが登録
 * される時点と、`@monaco-editor/react`側が`onChange`イベントリスナーを実際に
 * アタッチする時点との間に短い window があり、その隙間で`setValue`を呼ぶと
 * Monaco自身の描画(`.view-lines`、上のtoContainTextで検知できる内容)は
 * 正しく更新されるのに、変更イベントがReact側に一切届かない(onChangeが
 * 発火しない)ことがあるため。この場合、描画内容だけを見るリトライは
 * 「もう正しいから」と成功したことにしてしまい、以降ずっと気づけない。
 * `onChange`が発火すると同期的に(1s debounceの手前で)「保存中…」表示に
 * 切り替わる(`components/lab/LabWorkspace.tsx`の`handleCodeChange`、
 * `components/lab/LabToolbar.tsx`参照)ため、これを同じリトライブロック内で
 * 短いタイムアウトで確認し、見えなければ(=onChangeが届かなかった疑いがある
 * ため)ブロック全体([setValue+確認]の対)をやり直すようにした。
 */
async function typeClampSolution(page: Page) {
  const draftKey = "draft:lab-preview-demo/clamp:ja";

  await expect(async () => {
    await page.evaluate((code) => {
      const w = window as unknown as { monaco?: { editor: { getEditors(): { setValue(v: string): void }[] } } };
      const editor = w.monaco?.editor.getEditors()[0];
      if (!editor) throw new Error("Monaco editor instance not yet available");
      editor.setValue(code);
    }, SOLUTION_CODE);
    await expect(page.getByTestId("lab-code-editor")).toContainText("if (value < min) return min;", {
      timeout: 1000,
    });
    await expect(page.getByTestId("lab-autosave-indicator")).toHaveText(/保存中|Saving/, { timeout: 800 });
  }).toPass({ timeout: 15_000 });

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey), { timeout: 15_000 })
    .toContain("if (value < min) return min;");
}

test("コード入力→実行→合格表示", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico")) consoleErrors.push(msg.text());
  });

  await page.goto("/ja/lab-preview");
  await expect(page.getByTestId("lab-workspace")).toBeVisible();
  await expect(page.getByTestId("lab-code-editor")).toContainText("TODO");

  await typeClampSolution(page);
  await page.getByTestId("lab-run-button").click();

  await expect(page.getByTestId("lab-status-label")).toHaveText("合格");
  await expect(page.getByTestId("lab-result-body")).toContainText("3/3 件のテストに合格");
  await expect(page.getByTestId("lab-test-result-t1")).toContainText("✓");
  await expect(page.getByTestId("lab-test-result-t2")).toContainText("✓");
  await expect(page.getByTestId("lab-test-result-t3")).toContainText("✓");

  // Workerの使い捨て(terminate)自体の検証はtests/e2e/jsRunner.spec.tsが
  // 専用に担う(Monaco自身も内部で常駐Workerを持つため、このページでの
  // page.workers().length比較はMonaco側の非同期worker起動タイミングに
  // 左右されやすくflakyだった。qa-evaluator再検証で検出し撤去)。
  expect(consoleErrors).toEqual([]);
});

test("言語トグル→コードが保持されている", async ({ page }) => {
  await page.goto("/ja/lab-preview");
  await expect(page.getByTestId("lab-workspace")).toBeVisible();

  await typeClampSolution(page);
  await page.getByTestId("lab-run-button").click();
  await expect(page.getByTestId("lab-status-label")).toHaveText("合格");

  await page.getByRole("button", { name: "表示言語を切り替える" }).click();
  await expect(page).toHaveURL(/\/en\/lab-preview$/);

  // エディタ内容・実行結果(02§5.1)が言語切替をまたいで保持されていること。
  await expect(page.getByTestId("lab-code-editor")).toContainText("if (value < min) return min;");
  await expect(page.getByTestId("lab-status-label")).toHaveText("Passed");
  await expect(page.getByTestId("lab-result-body")).toContainText("3/3 tests passed");
});
