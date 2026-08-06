import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * T-703 AU-9(docs/design/11_ADR-011 §3.2)。ADR-009 §6「検索(T-306): ゲート対象
 * 本文が検索インデックスに含まれるとスニペットで内容が漏れる」の実ビルド検証。
 *
 * scripts/generate-curriculum.ts(generateSearchIndex)は2種類の検索インデックスを
 * 生成する:
 *  - lib/generated/search-index.{locale}.json          (Gated本文を含まない)
 *  - lib/generated/search-index-authenticated.{locale}.json (Gated本文を含む)
 *
 * lib/search/flexIndex.tsのSTORE_FIELDS(title/excerpt/href/kind)により、
 * FlexSearchのDocument export形式では本文全体ではなく`excerpt`
 * (lib/search/buildDocuments.tsのbuildExcerpt、本文冒頭を一定長で切り出した
 * スニペット)がそのまま(トークン化されず)格納される。Gated階層のモジュールでは、
 * 既定(未認証向け)インデックスのexcerptは`lesson.frontmatter.title`
 * (タイトルのみ)に制限されるが、認証済みインデックスのexcerptは実際の本文冒頭
 * スニペット(タイトルを含む、より長い実文章)になる。この差分自体が
 * 「本文がスニペットとして漏れる」というADR-009 §6の懸念の実体である。
 *
 * components/search/SearchPage.tsx("use client")はこの2種類のうちどちらを
 * `import()`するかを`isAuthenticated`(サーバ側`auth()`から渡されるprop)で
 * 分岐させている。しかし`import()`は"use client"コンポーネント内の動的importで
 * あり、Next.jsのビルドは両方の分岐を別々の静的チャンク(.next/static/chunks/配下)
 * として事前に出力する。実行時の分岐は「ブラウザ側でどちらのチャンクをfetchするか」
 * を選ぶだけであり、認証済みチャンク自体はビルド時点で静的アセットとして生成済み・
 * 到達可能URLを持つ。
 *
 * さらにmiddleware.tsのmatcher(`"/((?!api|_next|_vercel|.*\\..*).*)"`)は
 * `_next/*`を構造的に除外しているため、next-intlミドルウェア・認可ロジックは
 * `_next/static/chunks/*`に対して一切実行されない。Cloudflare Workers Static
 * Assets(wrangler.jsonc `assets.directory`、`run_worker_first`未設定=既定)は、
 * 一致する静的アセットへのリクエストをWorker本体(Next.js Route Handler/認可判定を
 * 含む)を経由させずに配信する。すなわちこのチャンクは「未認証で直接fetch可能な、
 * ゲート対象レッスンの本文スニペットを含む静的ファイル」である。
 *
 * このテストは安全な期待値(=ゲート対象本文スニペットを含む静的チャンクは
 * 存在しない)をassertしているため、現状の実装に対しては失敗(red)する。
 * 意図的であり、T-705で対策された時点でgreenに転じる回帰テストとして機能する
 * (ADR-010 §6)。詳細はdocs/security/findings.md参照。
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Gated階層(Free Tierのモジュール1以外)に属するレッスン。module 02-data-models
// (order=2)は09_ADR-008/10_ADR-009上、Free Tierではない。
const GATED_LESSON_DOC_ID = "lesson:02-data-models/01-relational-vs-document";

interface SearchDocStore {
  title: string;
  excerpt: string;
  href: string;
  kind: string;
}

function readDocStore(jsonPath: string, docId: string): SearchDocStore {
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as { "1.doc": string };
  const docEntries = JSON.parse(parsed["1.doc"]) as Array<[string, SearchDocStore]>;
  const entry = docEntries.find(([id]) => id === docId);
  if (!entry) {
    throw new Error(`${docId} が ${jsonPath} の store に見つかりません`);
  }
  return entry[1];
}

describe("AU-9: 検索インデックス(認証済み向け)のGated本文スニペット漏洩", () => {
  let gatedLessonTitle: string;
  let authenticatedExcerpt: string;
  let bodySnippetBeyondTitle: string;

  beforeAll(() => {
    const defaultIndexPath = path.join(repoRoot, "lib/generated/search-index.ja.json");
    const authenticatedIndexPath = path.join(repoRoot, "lib/generated/search-index-authenticated.ja.json");
    if (!existsSync(authenticatedIndexPath) || !existsSync(defaultIndexPath)) {
      throw new Error(
        "lib/generated/search-index*.json が存在しません。" +
          "npm run generate:curriculum(実コンテンツに対して、--rootオプションなし)を先に実行してください。",
      );
    }

    const defaultDoc = readDocStore(defaultIndexPath, GATED_LESSON_DOC_ID);
    const authenticatedDoc = readDocStore(authenticatedIndexPath, GATED_LESSON_DOC_ID);
    gatedLessonTitle = defaultDoc.title;
    authenticatedExcerpt = authenticatedDoc.excerpt;
    // タイトル部分を除いた、本文由来の実文章(スニペット本体)を抽出する。
    // buildExcerpt(lib/search/extractText.ts)はタイトルの直後に本文冒頭を
    // 連結する実装(前掲のexcerpt実例「リレーショナルモデルとドキュメントモデルの
    // 選択 アプリケーションを作るとき…」参照)であるため、タイトル文字列の
    // 直後から40文字を「本文由来のスニペット」として切り出す。
    const afterTitle = authenticatedExcerpt.slice(gatedLessonTitle.length).trim();
    bodySnippetBeyondTitle = afterTitle.slice(0, 40);
    if (bodySnippetBeyondTitle.length < 20) {
      throw new Error(
        `${GATED_LESSON_DOC_ID} のexcerptからタイトル以降の本文スニペットを十分な長さ抽出できませんでした: "${authenticatedExcerpt}"`,
      );
    }

    // next buildを実行し、.next/static/chunks/にクライアントバンドルを生成する
    // (既存のTシリーズテスト(workers/api/tests/apiRoutes.test.ts等)の
    // 「wrangler deploy --dry-runで実バンドルする」パターンと同じ考え方: ソースコードの
    // 読解ではなく実際のビルド成果物で検証する)。
    execFileSync("npx", ["next", "build"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    });
  }, 240_000);

  it("前提確認: 既定(未認証向け)インデックスのexcerptはGatedレッスンのタイトルのみで、本文スニペットを含まない", () => {
    const defaultDoc = readDocStore(path.join(repoRoot, "lib/generated/search-index.ja.json"), GATED_LESSON_DOC_ID);
    expect(defaultDoc.excerpt).toBe(gatedLessonTitle);
  });

  it("前提確認: 認証済みインデックスのexcerptはタイトルより長い、実際の本文スニペットを含む", () => {
    expect(authenticatedExcerpt.length).toBeGreaterThan(gatedLessonTitle.length + 20);
    expect(authenticatedExcerpt).not.toBe(gatedLessonTitle);
  });

  it(
    "【突破実証】.next/static/chunks/配下に、Gatedレッスンの本文スニペット(タイトルを超える実文章)を" +
      "含む静的チャンクが生成されていてはならない(未認証で直接fetch可能な経路のため)",
    () => {
      const chunksDir = path.join(repoRoot, ".next/static/chunks");
      const files = readdirSync(chunksDir).filter((f) => f.endsWith(".js"));

      const leakingFiles: string[] = [];
      for (const file of files) {
        const content = readFileSync(path.join(chunksDir, file), "utf-8");
        if (content.includes(bodySnippetBeyondTitle)) {
          leakingFiles.push(file);
        }
      }

      expect(
        leakingFiles,
        `Gated本文スニペット("${bodySnippetBeyondTitle}")を含む静的チャンクが検出された場合、そのファイル名一覧: ` +
          JSON.stringify(leakingFiles),
      ).toEqual([]);
    },
  );

  it(
    "情報: middleware.tsのmatcherは`_next/*`を構造的に除外しており、_next/static/chunks/配下への" +
      "リクエストにはアプリ側の認可ロジック(next-intlミドルウェア含む)が一切実行されない" +
      "(ソースコード上の事実。Cloudflare Workers Static Assetsの既定動作(run_worker_first未設定)と" +
      "合わせ、当該チャンクはWorker本体を経由せず配信される=デプロイ後も同じ結論になる)",
    () => {
      const middlewareSource = readFileSync(path.join(repoRoot, "middleware.ts"), "utf-8");
      expect(middlewareSource).toMatch(/_next/);
      const appWranglerSource = readFileSync(path.join(repoRoot, "wrangler.jsonc"), "utf-8");
      expect(appWranglerSource).not.toMatch(/run_worker_first/);
    },
  );
});
