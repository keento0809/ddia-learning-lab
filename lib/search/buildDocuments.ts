import { loadAllModules } from "../content";
import { loadGlossary } from "../glossaryContent";
import type { Locale } from "../contracts/common";
import type { SearchDocument } from "./types";
import { extractPlainText, buildExcerpt } from "./extractText";
import { getModuleAccessTier, isModuleFullyVisibleUnauthenticated } from "../moduleAccess";

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
 * T-604(ADR-009 §6)/T-705(docs/security/findings.md High #2)最終形: 検索
 * インデックスはNext.jsのビルド時に静的アセット(.next/static/chunks/配下)へ
 * 埋め込まれ、認証状態に関わらず誰でも直接fetchできる(サーバ側の認可判定を
 * 経由しない)。以前は「認証済み向け」に別インデックスを生成しGated階層の本文を
 * 含めていたが、これは静的アセットとして常時公開されるため実質的に無認証で
 * 全文が漏洩していた(AU-9所見、tests/security/au9-search-index-static-asset-leak.test.ts)。
 * したがってGated階層(モジュール1以外)のレッスンは常にタイトルのみ
 * (要約=タイトル)をbody/excerptとし、認証状態によって内容を変える分岐は
 * 一切持たない(kind:"module"のドキュメントが既にtitleのみをbody/excerptに
 * 使う既存パターンを踏襲)。モジュール一覧・用語集はADR-009 §3.1でPublicと
 * 定義されており未認証でも全文閲覧可能なため対象外(常に全文を含める)。
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

    const tier = getModuleAccessTier(mod.meta.order);
    const exposeFullBody = isModuleFullyVisibleUnauthenticated(tier);

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
