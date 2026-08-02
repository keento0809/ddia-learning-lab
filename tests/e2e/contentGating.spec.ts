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
 *
 * 追記(2026-08-02): 本ファイル初回執筆時に発見した`lib/runner/harness.worker.ts`の
 * バグ(`runHarness`が`RunRequest.entry`固定の単一関数のみを全テストケースに対して
 * 呼び出し、`content/ja/01-reliability/labs/percentile-lab.yaml`のt6/t7が使う
 * `worstOfConcurrentCalls`を無視していたため、模範解答を入力しても必ず6/8で
 * 不合格になっていた問題)は、別タスクのPR #103(dispatch each test case to its own
 * call.fn)・PR #105(wire grader.ts's oneOf/matches evaluation)でmainにマージ済み。
 * 本ファイルもorigin/mainへのrebase後に実ブラウザ経由で8/8合格を再確認し、
 * 以下の演習合格アサーションを復元した。
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

test("未認証: モジュール1の演習に模範解答で合格できる(ドラフト自動保存を含む)", async ({ page }) => {
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
  // percentile-lab.yamlはt1-t5/t8が`percentile`、t6-t7が`worstOfConcurrentCalls`を
  // call.fnで呼び分ける(PR #103/#105でharness.worker.tsに配線済み)。8件全問を
  // 明示的に確認することで、この配線が実ブラウザ経路で機能していることを保証する。
  await expect(page.getByTestId("lab-status-message")).toHaveText("合格");
  await expect(page.getByText("8/8 件のテストに合格")).toBeVisible();
  // status==="passed"になるとlab-submission-bannerは認証状態に関わらず描画される
  // (components/lab/LabWorkspace.tsx)。未認証時は`recordOutcome`がPOST
  // /api/submissions(worker-api経由Service Binding)を`if (!isAuthenticated) return;`
  // で早期returnし提出APIを一切呼ばない(=`submissionPhase`が"recorded"/"error"へ
  // 遷移しない)ため、バナーは「サインインすると提出結果と進捗が記録されます」の
  // ままとなり、next dev下でも503を踏まずここまで到達できる。
  await expect(page.getByTestId("lab-submission-banner")).toHaveText(
    "サインインすると提出結果と進捗が記録されます",
  );
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
