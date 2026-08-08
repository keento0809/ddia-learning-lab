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

    expect(docs).toHaveLength(5);
  });

  it("en: 同じ件数のドキュメントを英語の title/body で抽出する", () => {
    const docs = buildSearchDocuments(FIXTURES_ROOT, "en");

    expect(docs).toHaveLength(5);
    const lessonDoc = docs.find((d) => d.id === "lesson:01-reliability/01-fault-tolerance");
    expect(lessonDoc?.title).toBe("Introduction to Fault Tolerance");
    expect(lessonDoc?.body).toContain("fault tolerance");
    expect(lessonDoc?.body).toContain("network partition");

    const glossaryDoc = docs.find((d) => d.kind === "glossary");
    expect(glossaryDoc?.title).toBe("network partition");
  });

  it("T-604/T-705(ADR-009 §6、docs/security/findings.md High #2): Gated階層(モジュール1以外)のレッスン本文は索引・要約から常に除外し、タイトルのみにする(認証状態による分岐はしない)", () => {
    const docs = buildSearchDocuments(FIXTURES_ROOT, "ja");

    const freeTierLesson = docs.find((d) => d.id === "lesson:01-reliability/01-fault-tolerance");
    expect(freeTierLesson?.body).toContain("フォールトトレランス");
    expect(freeTierLesson?.excerpt).not.toBe(freeTierLesson?.title);

    const gatedModuleDoc = docs.find((d) => d.id === "module:02-gated");
    expect(gatedModuleDoc?.title).toBe("ゲート対象モジュール(検索フィクスチャ)");

    const gatedLesson = docs.find((d) => d.id === "lesson:02-gated/01-secret-lesson");
    expect(gatedLesson?.title).toBe("秘匿レッスン入門");
    // 本文(機密情報を模したテキスト)は索引にも要約にも一切含まれない
    expect(gatedLesson?.body).toBe("秘匿レッスン入門");
    expect(gatedLesson?.excerpt).toBe("秘匿レッスン入門");
    expect(gatedLesson?.body).not.toContain("分散合意プロトコル");
    expect(gatedLesson?.excerpt).not.toContain("分散合意プロトコル");
  });

  it("en: T-604のGated制限は英語ロケールでも同様に働く", () => {
    const docs = buildSearchDocuments(FIXTURES_ROOT, "en");

    const gatedLesson = docs.find((d) => d.id === "lesson:02-gated/01-secret-lesson");
    expect(gatedLesson?.title).toBe("Introduction to the Secret Lesson");
    expect(gatedLesson?.body).toBe("Introduction to the Secret Lesson");
    expect(gatedLesson?.excerpt).toBe("Introduction to the Secret Lesson");
    expect(gatedLesson?.body).not.toContain("consensus protocol");
  });
});
