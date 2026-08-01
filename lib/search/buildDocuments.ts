import { loadAllModules } from "../content";
import { loadGlossary } from "../glossaryContent";
import type { Locale } from "../contracts/common";
import type { SearchDocument } from "./types";
import { extractPlainText, buildExcerpt } from "./extractText";
import { getModuleAccessTier, isModuleFullyVisibleUnauthenticated } from "../moduleAccess";

export interface BuildSearchDocumentsOptions {
  /**
   * T-604(ADR-009 §6)。既定(false)ではGated階層(モジュール1以外)の
   * レッスン本文を索引・表示対象から除外し、タイトルのみ(要約=タイトル)に
   * 制限する。trueを指定すると全レッスンの全文を含める
   * (認証済みユーザー向けインデックス生成専用、scripts/generate-curriculum.ts参照)。
   */
  includeGatedLessonBody?: boolean;
}

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
 *
 * T-604(ADR-009 §6): 「ゲート対象本文が検索インデックスに含まれると、スニペットで
 * 内容が漏れる」対策として、Gated階層(モジュール1以外)のレッスンは既定で
 * タイトルのみをbody/excerptとする(kind:"module"のドキュメントが既にtitleのみを
 * body/excerptに使う既存パターンを踏襲)。モジュール一覧・用語集はADR-009 §3.1で
 * Publicと定義されており未認証でも全文閲覧可能なため対象外(常に全文を含める)。
 */
export function buildSearchDocuments(
  root: string,
  locale: Locale,
  options: BuildSearchDocumentsOptions = {},
): SearchDocument[] {
  const includeGatedLessonBody = options.includeGatedLessonBody ?? false;
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

    const tier = getModuleAccessTier(mod.meta.order);
    const exposeFullBody = includeGatedLessonBody || isModuleFullyVisibleUnauthenticated(tier);

    for (const lesson of mod.lessons) {
      const text = exposeFullBody ? extractPlainText(lesson.body) : lesson.frontmatter.title;
      docs.push({
        id: `lesson:${lesson.slug}`,
        kind: "lesson",
        title: lesson.frontmatter.title,
        body: text,
        excerpt: exposeFullBody ? buildExcerpt(text) : lesson.frontmatter.title,
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
