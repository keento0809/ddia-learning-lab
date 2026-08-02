import { test, expect, type Page } from "@playwright/test";

/**
 * T-605(docs/design/10_ADR-009_アクセス制御設計.md §7)。
 * T-602(サーバ側ガード)・T-603(ソフトウォールUI)・T-604(クイズ/演習ゲーティング)
 * が守る境界を、未認証ユーザーの実ブラウザ操作として通しで検証する。
 *
 * スコープ外(意図的に対象外、理由あり):
 * - 「登録(サインアップ)→モジュール2の続きが読める→ゲスト進捗がマージされている」の
 *   後半(サインアップ以降)。`tests/e2e/accountMenu.spec.ts`のコメントが指す
 *   2026-07-31付「next devはService Bindingをエミュレートできない」決定事項により、
 *   `npm run test:e2e`が使うwebServer(`next dev`)上ではサインアップ/サインイン
 *   (`lib/auth/workerApiAuth.ts`のsignupViaWorkerApi、worker-apiへのService Binding経由)
 *   が常に503で失敗する。モック化してテストを緑にすることはCLAUDE.mdの絶対規則3
 *   (モック・スタブによる「実装したことにする」の禁止)に反するため行わない。
 *   本ファイルは、この既知の制約が解消されるまで到達可能な範囲(未認証での
 *   モジュール1完走とモジュール2ソフトウォール到達)のみを検証する。
 * - 構造化データ(JSON-LD)の検証。リポジトリ全体を検索したがJSON-LD生成は
 *   どこにも実装されていない(ADR-009 §6/§7が言及する成果物が未着手)。存在しない
 *   ものを「検証済み」と報告することはできないため、この観点は対象外とする。
 * - モジュール1演習(percentile-lab)の「合格」判定。本ファイル執筆中に発見した
 *   既存バグにより対象外とする: `lib/runner/harness.worker.ts`の`runHarness`は
 *   `RunRequest.entry`(演習1個につき固定の単一関数名)を全テストケースに対して
 *   一律に呼び出す(`moduleExports[request.entry](...test.args)`、テストごとの
 *   関数名指定は見ない)。一方`content/ja/01-reliability/labs/percentile-lab.yaml`
 *   はt1-t5/t8が`percentile`、t6-t7が`worstOfConcurrentCalls`という2つの異なる
 *   関数を`call.fn`で呼び分ける設計になっており、模範解答
 *   (`labs/__solutions__/percentile-lab.solution.ts`)をそのままエディタに入力して
 *   実行しても、実際のブラウザ実行経路ではt6/t7が`percentile(...)`に誤った引数を
 *   渡す形になり必ず不合格になる(6/8）。`lib/lab/buildRunRequest.ts`のコメントが
 *   指す「grader.ts(oneOf/matches/property対応の完全な採点器)がharness.worker.tsに
 *   配線されていない」という既知ギャップ(T-107c決定事項ログ)の具体的な実害であり、
 *   content-authoring側のテスト(`percentile-lab.solution.test.ts`、`gradeExercise`
 *   経由でテストごとに正しい関数を解決する)は正しく合格するため、これまで気づかれて
 *   いなかった。テストファイルのみの変更に限定されるT-605のスコープでは修正できない
 *   (`lib/runner/harness.worker.ts`または`lib/contracts/runner.ts`、
 *   percentile-lab.yamlのいずれかの変更が必要)ため、別タスクとして報告する。
 */

const MODULE_1_SLUG = "01-reliability";
const MODULE_1_LESSONS = [
  "01-reliability-and-faults",
  "02-load-and-scalability",
  "03-latency-and-percentiles",
  "04-maintainability",
] as const;

const MODULE_2_SLUG = "02-data-models";
const MODULE_2_PREVIEW_LESSON = "01-relational-vs-document";
const MODULE_2_GATED_LESSON = "02-document-schema-flexibility";

// 全問正解の選択肢(content/ja/01-reliability/quiz.yaml = content/en/01-reliability/quiz.yaml、
// ロジック共有につきja/en同一)。
const QUIZ_1_ANSWERS: Record<string, string> = {
  q1: "b",
  q2: "b",
  q3: "b",
  q4: "b",
  q5: "b",
  q6: "b",
  q7: "a",
};

const PERCENTILE_LAB_SOLUTION = `export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[index];
}

export function worstOfConcurrentCalls(callLatenciesPerRequest) {
  return callLatenciesPerRequest.map((calls) => Math.max(...calls));
}
`;

/**
 * labWorkspace.spec.ts「失敗→恒久対策(1)〜(3)」と同じ理由(Monaco実インスタンスへの
 * setValue、onChangeがReact/zustandへ届いたことをlocalStorageドラフトの実際の書き込みで
 * 確認する)により、同じ確定的な待機パターンをここでも用いる。
 */
async function typeLabSolution(page: Page, draftKey: string, solution: string, expectedSnippet: string) {
  await expect(async () => {
    await page.evaluate((code) => {
      const w = window as unknown as { monaco?: { editor: { getEditors(): { setValue(v: string): void }[] } } };
      const editor = w.monaco?.editor.getEditors()[0];
      if (!editor) throw new Error("Monaco editor instance not yet available");
      editor.setValue(code);
    }, solution);
    await expect(page.getByTestId("lab-code-editor")).toContainText(expectedSnippet, { timeout: 1000 });
    // monaco.editor.getEditors()にインスタンスが登録される時点と、
    // @monaco-editor/reactがonChangeリスナーを実際にアタッチする時点との間に
    // 短いwindowがあり、そこでsetValueすると描画(view-lines)は更新されるのに
    // onChangeがReact側へ一切届かないことがある(この場合ドラフトは永久に保存
    // されない)。「保存中…」への遷移が同期的に見えることでリスナーが実際に
    // 発火したことを確認し、見えなければブロック全体をやり直す
    // (tests/e2e/labWorkspace.spec.tsの同名の恒久対策と同じ理由)。
    await expect(page.getByTestId("lab-autosave-indicator")).toHaveText(/保存中|Saving/, { timeout: 800 });
  }).toPass({ timeout: 15_000 });

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey), { timeout: 15_000 })
    .toContain(expectedSnippet);
}

test("未認証: モジュール1のレッスン4本を完走し、クイズに合格できる", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico")) consoleErrors.push(msg.text());
  });

  for (const lessonId of MODULE_1_LESSONS) {
    await page.goto(`/ja/learn/${MODULE_1_SLUG}/${lessonId}`);
    await expect(page.getByTestId("lesson-article")).toBeVisible();
    await expect(page.getByTestId("content-wall")).toHaveCount(0);
    await page.getByTestId("lesson-complete-next").click();
    // 未認証時はPUT /api/progressを呼ばずlocalStorage(guest-progress)へ即時記録する
    // (T-113、components/lesson/CompleteAndNextButton.tsxのonGuestComplete)。
    // ネットワーク往復を待つ必要がないため、記録完了後は次のレッスンへ直接遷移してよい。
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("guest-progress")))
      .toContain(lessonId);
  }

  await page.goto(`/ja/learn/${MODULE_1_SLUG}/quiz`);
  for (const [questionId, optionId] of Object.entries(QUIZ_1_ANSWERS)) {
    const card = page.getByTestId(`quiz-question-${questionId}`);
    await card.locator(`input[value="${optionId}"]`).check();
    await page.getByTestId(`quiz-question-${questionId}-check`).click();
  }
  await expect(page.getByTestId("quiz-result")).toContainText("7/7");

  expect(consoleErrors).toEqual([]);
});

test("未認証: モジュール1の演習ページはアクセス可能で、ドラフト自動保存が動作する", async ({ page }) => {
  // 「演習に合格できる」までは検証しない: ファイル冒頭のコメントに記載した
  // 既存バグ(harness.worker.tsが常にexercise.entryのみを呼び出し、
  // percentile-lab.yamlのt6/t7が使う`worstOfConcurrentCalls`を無視する)により、
  // 模範解答をそのまま入力しても実行結果は必ず6/8("不合格")になる。ここでは
  // このバグの影響を受けない範囲(未認証でもページ・エディタ・自動保存・
  // 未提出バナーが正しく機能すること)のみを検証する。
  await page.goto(`/ja/learn/${MODULE_1_SLUG}/lab/percentile-lab`);
  await expect(page.getByTestId("lab-workspace")).toBeVisible();
  await expect(page.getByTestId("content-wall")).toHaveCount(0);

  await typeLabSolution(
    page,
    `draft:${MODULE_1_SLUG}/percentile-lab:ja`,
    PERCENTILE_LAB_SOLUTION,
    "worstOfConcurrentCalls",
  );

  await page.getByTestId("lab-run-button").click();
  // 上記の既知バグにより結果は「不合格」になるため合否は断定しない
  // (components/lab/LabWorkspace.tsxのlab-submission-bannerはstatus==="passed"の
  // 時のみ描画されるため、ここでは表示アサーションを行わない)。
  // lab-status-message(components/lab/ResultPanel.tsx)は実行結果を受け取った後
  // にのみ描画される(未実行時は`t.notRunYet`のプレースホルダのみ)ため、これが
  // 表示されることをもって実行自体がエラーにならず完了したことを確認する。
  // 未認証では`recordOutcome`(components/lab/LabWorkspace.tsx)がPOST
  // /api/submissions(worker-api経由Service Binding)を`if (!isAuthenticated) return;`
  // で早期returnして一切呼ばないため、next dev下でも503を踏まずここまで到達できる。
  await expect(page.getByTestId("lab-status-message")).toBeVisible();
});

test("未認証: モジュール2の1レッスン目(Preview階層)は冒頭のみ表示しソフトウォールへフェードする", async ({
  page,
}) => {
  await page.goto(`/ja/learn/${MODULE_2_SLUG}/${MODULE_2_PREVIEW_LESSON}`);

  await expect(page.getByTestId("content-wall")).toBeVisible();
  const preview = page.getByTestId("content-wall-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("リレーショナルモデルの考え方");
  await expect(preview).toContainText("ドキュメントモデルの考え方");
  // 3見出し目以降(Gated範囲)はプレビューに含まれない(lib/lessonPreview.tsの
  // 3つ目の見出しで切る仕様、tests/unit/lesson/accessGate.test.tsと同じ境界)。
  await expect(preview).not.toContainText("インピーダンスミスマッチという問題");

  await expect(page.getByTestId("content-wall-fade")).toBeVisible();
  await expect(page.getByTestId("content-wall-box")).toBeVisible();
  await expect(page.getByTestId("content-wall-cta-signup")).toHaveAttribute("href", "/ja/auth/signup");
  await expect(page.getByTestId("content-wall-cta-signin")).toHaveAttribute("href", "/ja/auth/signin");
  await expect(page.getByTestId("content-wall-free-tier-link")).toHaveAttribute(
    "href",
    `/ja/learn/${MODULE_1_SLUG}`,
  );
});

test("未認証: モジュール2の2レッスン目以降(Gated階層)はプレビューなしで完全にウォールされる", async ({
  page,
}) => {
  const response = await page.goto(`/ja/learn/${MODULE_2_SLUG}/${MODULE_2_GATED_LESSON}`);
  await expect(page.getByTestId("content-wall")).toBeVisible();
  await expect(page.getByTestId("content-wall-preview")).toHaveCount(0);
  await expect(page.getByTestId("content-wall-box")).toBeVisible();

  // T-602受入基準: 未認証時のレスポンスbodyに本文が一切含まれないこと。
  const body = await response!.text();
  expect(body).not.toContain("スキーマオンライトとスキーマオンリード");
  expect(body).not.toContain("スキーマ柔軟性が効く場面・効かない場面");
});

test("未認証: モジュール2のクイズ・演習はプレースホルダでガードされ本体データが読み込まれない", async ({
  page,
}) => {
  const quizResponse = await page.goto(`/ja/learn/${MODULE_2_SLUG}/quiz`);
  await expect(page.getByTestId("quiz-access-locked")).toBeVisible();
  await expect(page.getByTestId("quiz-result")).toHaveCount(0);
  const quizBody = await quizResponse!.text();
  // content/ja/02-data-models/quiz.yamlの設問文が漏れていないこと(T-604)。
  expect(quizBody).not.toMatch(/quiz-question-q\d/);

  const labResponse = await page.goto(`/ja/learn/${MODULE_2_SLUG}/lab/denormalize-users-lab`);
  await expect(page.getByTestId("lab-access-locked")).toBeVisible();
  await expect(page.getByTestId("lab-workspace")).toHaveCount(0);
  const labBody = await labResponse!.text();
  expect(labBody).not.toContain("lab-code-editor");
});

test("カリキュラム一覧: 未認証時はGatedモジュールに鍵アイコンが表示され、Free Tierには表示されない", async ({
  page,
}) => {
  await page.goto("/ja/learn");
  await expect(page.getByTestId(`curriculum-module-lock-${MODULE_2_SLUG}`)).toBeVisible();
  await expect(page.getByTestId(`curriculum-module-lock-${MODULE_1_SLUG}`)).toHaveCount(0);
});

test("SEO: ゲート対象レッスンの生HTMLレスポンスにプレビュー本文・タイトル・hreflangが含まれる", async ({
  page,
}) => {
  const response = await page.goto(`/ja/learn/${MODULE_2_SLUG}/${MODULE_2_PREVIEW_LESSON}`);
  expect(response?.status()).toBe(200);
  const body = await response!.text();

  // 冒頭本文(プレビュー)がクライアントJS実行前のレスポンスに含まれる
  // (app/[locale]/learn/[module]/[lesson]/page.tsxはServer Component、
  // ContentWallも"use client"を持たずdangerouslySetInnerHTMLで直接埋め込む)。
  expect(body).toContain("リレーショナルモデルの考え方");

  // タイトル(generateMetadataはauth状態を見ないため、Gatedページでも常に生成される)。
  await expect(page).toHaveTitle(/./);
  expect(body).toMatch(/<title>[^<]+<\/title>/);

  // hreflang alternate(lib/i18n/alternates.tsのbuildLanguageAlternates)。
  const alternateLinks = page.locator('link[rel="alternate"][hreflang]');
  await expect(alternateLinks).toHaveCount(3);
  const hreflangs = await alternateLinks.evaluateAll((els) =>
    els.map((el) => el.getAttribute("hreflang")),
  );
  expect(hreflangs.sort()).toEqual(["en", "ja", "x-default"]);
});
