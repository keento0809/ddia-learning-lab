import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSearchDocuments } from "@/lib/search/buildDocuments";

const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/search", import.meta.url));

describe("buildSearchDocuments", () => {
  it("ja: モジュール・レッスン・用語集からドキュメントを抽出する", () => {
    const docs = buildSearchDocuments(FIXTURES_ROOT, "ja");

    const moduleDoc = docs.find((d) => d.kind === "module");
    expect(moduleDoc).toEqual({
      id: "module:01-reliability",
      kind: "module",
      title: "信頼性の基礎(検索フィクスチャ)",
      body: "信頼性の基礎(検索フィクスチャ)",
      excerpt: "信頼性の基礎(検索フィクスチャ)",
      href: "/learn/01-reliability",
    });

    const lessonDoc = docs.find((d) => d.kind === "lesson");
    expect(lessonDoc?.id).toBe("lesson:01-reliability/01-fault-tolerance");
    expect(lessonDoc?.title).toBe("フォールトトレランス入門");
    expect(lessonDoc?.href).toBe("/learn/01-reliability/01-fault-tolerance");
    expect(lessonDoc?.body).toContain("フォールトトレランス");
    expect(lessonDoc?.body).toContain("ネットワーク分断");
    expect(lessonDoc?.body).not.toContain("<Term");

    const glossaryDoc = docs.find((d) => d.kind === "glossary");
    expect(glossaryDoc).toEqual({
      id: "glossary:network-partition",
      kind: "glossary",
      title: "ネットワーク分断",
      body: "ノード群が複数のグループに分かれて相互に通信できなくなる状態(架空の説明、テスト用フィクスチャ)。",
      excerpt: "ノード群が複数のグループに分かれて相互に通信できなくなる状態(架空の説明、テスト用フィクスチャ)。",
      href: "/glossary",
    });

    expect(docs).toHaveLength(3);
  });

  it("en: 同じ件数のドキュメントを英語の title/body で抽出する", () => {
    const docs = buildSearchDocuments(FIXTURES_ROOT, "en");

    expect(docs).toHaveLength(3);
    const lessonDoc = docs.find((d) => d.kind === "lesson");
    expect(lessonDoc?.title).toBe("Introduction to Fault Tolerance");
    expect(lessonDoc?.body).toContain("fault tolerance");
    expect(lessonDoc?.body).toContain("network partition");

    const glossaryDoc = docs.find((d) => d.kind === "glossary");
    expect(glossaryDoc?.title).toBe("network partition");
  });
});
