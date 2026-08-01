import { loadAllModules } from "../content";
import { loadGlossary } from "../glossaryContent";
import type { Locale } from "../contracts/common";
import type { SearchDocument } from "./types";
import { extractPlainText, buildExcerpt } from "./extractText";

/**
 * T-306 検索(S-09)向けの検索対象ドキュメント抽出。
 * `lib/content.ts`/`lib/glossaryContent.ts`と同じ理由(node:fs依存)で、
 * next buildの静的生成文脈またはNode CLIスクリプト(scripts/generate-curriculum.ts)
 * からのみ使用する。
 *
 * 対象: モジュール一覧・レッスン本文・用語集(02§9「検索インデックス」、
 * 01基本設計書 S-09「コンテンツ横断検索」)。演習YAML(labs/*.yaml)は
 * 表示に足るタイトル文言(ExerciseDefinitionにtitle/description相当のフィールドが
 * 存在しない、lib/contracts/exercise.ts参照)を持たないため対象外とする。
 */
export function buildSearchDocuments(root: string, locale: Locale): SearchDocument[] {
  const docs: SearchDocument[] = [];

  for (const mod of loadAllModules(root, locale)) {
    docs.push({
      id: `module:${mod.slug}`,
      kind: "module",
      title: mod.meta.title,
      body: mod.meta.title,
      excerpt: mod.meta.title,
      href: `/learn/${mod.slug}`,
    });

    for (const lesson of mod.lessons) {
      const text = extractPlainText(lesson.body);
      docs.push({
        id: `lesson:${lesson.slug}`,
        kind: "lesson",
        title: lesson.frontmatter.title,
        body: text,
        excerpt: buildExcerpt(text),
        // lesson.slug は "{moduleSlug}/{lessonBaseName}" 形式(lib/content.ts)で、
        // tocItemHrefの `/learn/${moduleSlug}/${item.id}` と同一のURL形式になる。
        href: `/learn/${lesson.slug}`,
      });
    }
  }

  for (const entry of loadGlossary(root)) {
    const definition = entry.definition[locale];
    docs.push({
      id: `glossary:${entry.slug}`,
      kind: "glossary",
      title: entry.term[locale],
      body: definition,
      excerpt: buildExcerpt(definition),
      href: "/glossary",
    });
  }

  return docs;
}
