import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSearchDocuments } from "@/lib/search/buildDocuments";
import {
  addSearchDocument,
  createSearchIndex,
  exportSearchIndex,
  loadSearchIndex,
  searchDocuments,
} from "@/lib/search/flexIndex";
import type { SearchDocument } from "@/lib/search/types";

const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/search", import.meta.url));

/**
 * T-306 受入基準(3)「日本語トークナイズの検索ヒットテスト」。
 * 日本語は単語境界で分割できないため、バイグラム(隣接2文字)トークン化で
 * 複合語の部分文字列一致を実現している(lib/search/flexIndex.ts)。
 * 複合語の部分文字列クエリでもヒットすること、MDXタグ除去後の地の文
 * (Callout由来含む)が索引化されていること、そして最初にFlexSearch組み込みの
 * CJKチャーセット(1文字単位分割)で実装した際にqa-evaluator実機検証で発覚した
 * 「文字単位AND一致による大量の偽陽性」(例: 「分断」クエリで「処分の判断」等の
 * 無関係な文書がヒットしてしまう)が再発しないことを、実データ抽出パイプライン
 * (buildSearchDocuments)から一気通貫で検証する。
 */
describe("日本語トークナイズの検索ヒット", () => {
  function buildJaIndex() {
    const index = createSearchIndex("ja");
    for (const doc of buildSearchDocuments(FIXTURES_ROOT, "ja")) {
      addSearchDocument(index, "ja", doc);
    }
    return index;
  }

  it("複合語の部分文字列(「ネットワーク分断」の「分断」)でレッスン・用語集の両方にヒットする", () => {
    const hits = searchDocuments(buildJaIndex(), "ja", "分断");
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("lesson:01-reliability/01-fault-tolerance");
    expect(ids).toContain("glossary:network-partition");
  });

  it("Term展開語の前方一致(「フォールトトレランス」の「フォールト」)でヒットする", () => {
    const hits = searchDocuments(buildJaIndex(), "ja", "フォールト");
    expect(hits.map((h) => h.id)).toContain("lesson:01-reliability/01-fault-tolerance");
  });

  it("Callout由来の地の文(「冗長性」)が索引化されている", () => {
    const hits = searchDocuments(buildJaIndex(), "ja", "冗長性");
    expect(hits.map((h) => h.id)).toContain("lesson:01-reliability/01-fault-tolerance");
  });

  it("一致しないクエリは空配列を返す", () => {
    expect(searchDocuments(buildJaIndex(), "ja", "存在しないキーワードXYZ")).toEqual([]);
  });

  it("export→import後も同じヒットが再現される(静的JSON化の往復)", () => {
    const exported = exportSearchIndex(buildJaIndex());
    const restored = loadSearchIndex("ja", exported);

    const hits = searchDocuments(restored, "ja", "分断");
    expect(hits.map((h) => h.id)).toContain("lesson:01-reliability/01-fault-tolerance");
    expect(hits[0]?.doc?.title).toBeTruthy();
  });

  it("回帰防止: 同じ2文字を含んでいても隣接していない文書は複合語クエリにヒットしない(文字単位AND一致への逆戻り防止)", () => {
    const index = createSearchIndex("ja");
    const adjacent: SearchDocument = {
      id: "lesson:adjacent",
      kind: "lesson",
      title: "ネットワーク分断への対処",
      body: "ネットワーク分断が起きても処理を継続できる設計が求められる。",
      excerpt: "ネットワーク分断が起きても処理を継続できる設計が求められる。",
      href: "/learn/adjacent",
    };
    const scattered: SearchDocument = {
      id: "lesson:scattered",
      kind: "lesson",
      title: "権限分掌と判断基準",
      body: "処分の判断について十分に検討する必要がある。分野ごとの断片的な対応は避ける。",
      excerpt: "処分の判断について十分に検討する必要がある。",
      href: "/learn/scattered",
    };
    addSearchDocument(index, "ja", adjacent);
    addSearchDocument(index, "ja", scattered);

    const hits = searchDocuments(index, "ja", "分断");
    expect(hits.map((h) => h.id)).toEqual(["lesson:adjacent"]);
  });

  it("1文字クエリの結果は(0件でも複数件でも)常にその文字を実際に含む文書のみである(偽陽性なし)", () => {
    // 1文字クエリが常に0件になるとは主張しない(lib/search/flexIndex.tsのコメント参照:
    // 実データ規模ではFlexSearch側の挙動により非空になることを実機確認済み)。
    // ここで検証するのは「ヒットするなら必ず本当にその文字を含む」という精度の性質。
    const jaDocs = buildSearchDocuments(FIXTURES_ROOT, "ja");
    const hits = searchDocuments(buildJaIndex(), "ja", "分");
    for (const hit of hits) {
      const doc = jaDocs.find((d) => d.id === hit.id);
      expect(doc).toBeDefined();
      expect(doc!.title.includes("分") || doc!.body.includes("分")).toBe(true);
    }
  });
});

describe("英語ロケールの検索ヒット(パリティ確認)", () => {
  function buildEnIndex() {
    const index = createSearchIndex("en");
    for (const doc of buildSearchDocuments(FIXTURES_ROOT, "en")) {
      addSearchDocument(index, "en", doc);
    }
    return index;
  }

  it("前方一致(fault → fault tolerance)でヒットする", () => {
    const hits = searchDocuments(buildEnIndex(), "en", "fault");
    expect(hits.map((h) => h.id)).toContain("lesson:01-reliability/01-fault-tolerance");
  });

  it("用語集(network partition)にもヒットする", () => {
    const hits = searchDocuments(buildEnIndex(), "en", "partition");
    expect(hits.map((h) => h.id)).toContain("glossary:network-partition");
  });
});
