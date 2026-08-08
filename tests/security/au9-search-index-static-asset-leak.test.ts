import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * T-703 AU-9(docs/design/11_ADR-011 §3.2)。ADR-009 §6「検索(T-306): ゲート対象
 * 本文が検索インデックスに含まれるとスニペットで内容が漏れる」の実ビルド検証。
 *
 * 修正前: scripts/generate-curriculum.ts(generateSearchIndex)は2種類の検索
 * インデックスを生成していた:
 *  - lib/generated/search-index.{locale}.json          (Gated本文を含まない)
 *  - lib/generated/search-index-authenticated.{locale}.json (Gated本文を含む)
 * components/search/SearchPage.tsx("use client")は`isAuthenticated`propで
 * どちらを`import()`するかを分岐させていたが、Next.jsのビルドは両方の分岐を
 * 別々の静的チャンク(.next/static/chunks/配下)として事前出力するため、
 * 実行時の分岐は「ブラウザ側でどちらのチャンクをfetchするか」を選ぶだけであり、
 * 認証済みチャンク自体はビルド時点で静的アセットとして生成済み・到達可能URLを
 * 持っていた。さらにmiddleware.tsのmatcherは`_next/*`を構造的に除外しており、
 * Cloudflare Workers Static Assets(`run_worker_first`未設定=既定)は一致する
 * 静的アセットをWorker本体を経由させず配信するため、デプロイ後もこの静的
 * チャンクは認可ロジックを一切経由せず誰でも直接fetchできていた(ADR-011 §5
 * 「ゲート対象コンテンツの全文漏洩」= High、公開不可)。
 *
 * T-705修正(docs/security/findings.md): 認証状態に応じて内容を切り替える設計
 * そのものが静的アセット配信と両立しないため、生成する検索インデックスを
 * 1種類(lib/generated/search-index.{locale}.json)のみに統一し、
 * lib/search/buildDocuments.tsはGated階層のレッスンについて認証状態に
 * 関わらず常にタイトルのみをbody/excerptとするようにした
 * (`search-index-authenticated.*.json`はもう生成されない)。これにより本ファイルの
 * 各テストは「攻撃が成立する」ことを固定する回帰テストから、「防御が成立する」
 * ことを検証するテストへ書き換えている(期待値の書き換えではなく実装修正が先。
 * T-705 sandbox-hardening PR#110と同じ手法)。
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

describe("AU-9: 検索インデックスのGated本文スニペット漏洩", () => {
  let gatedLessonTitle: string;

  beforeAll(() => {
    const defaultIndexPath = path.join(repoRoot, "lib/generated/search-index.ja.json");
    if (!existsSync(defaultIndexPath)) {
      throw new Error(
        "lib/generated/search-index.ja.json が存在しません。" +
          "npm run generate:curriculum(実コンテンツに対して、--rootオプションなし)を先に実行してください。",
      );
    }

    const defaultDoc = readDocStore(defaultIndexPath, GATED_LESSON_DOC_ID);
    gatedLessonTitle = defaultDoc.title;

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

  it("防御が効く(T-705修正済み): 検索インデックスはsearch-index.{locale}.json1種類のみで、search-index-authenticated.{locale}.jsonはもう生成されない", () => {
    expect(existsSync(path.join(repoRoot, "lib/generated/search-index.ja.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "lib/generated/search-index.en.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "lib/generated/search-index-authenticated.ja.json"))).toBe(
      false,
    );
    expect(existsSync(path.join(repoRoot, "lib/generated/search-index-authenticated.en.json"))).toBe(
      false,
    );
  });

  it("防御が効く(T-705修正済み): 唯一の検索インデックスにおいて、Gatedレッスンのexcerptはタイトルのみで本文スニペットを含まない", () => {
    const defaultDoc = readDocStore(path.join(repoRoot, "lib/generated/search-index.ja.json"), GATED_LESSON_DOC_ID);
    expect(defaultDoc.excerpt).toBe(gatedLessonTitle);
  });

  it("防御が効く(T-705修正済み): .next/static/chunks/配下のいかなる静的チャンクにも、Gatedレッスンの本文由来のテキストを含む「認証済み向け」検索インデックスは存在しない(そもそも生成されないため漏洩しようがない)", () => {
    const chunksDir = path.join(repoRoot, ".next/static/chunks");
    const files = readdirSync(chunksDir).filter((f) => f.endsWith(".js"));

    const leakingFiles: string[] = [];
    for (const file of files) {
      const content = readFileSync(path.join(chunksDir, file), "utf-8");
      if (content.includes("search-index-authenticated")) {
        leakingFiles.push(file);
      }
    }

    expect(
      leakingFiles,
      `search-index-authenticatedへの参照を含む静的チャンクが検出された場合、そのファイル名一覧: ` +
        JSON.stringify(leakingFiles),
    ).toEqual([]);
  });
});
