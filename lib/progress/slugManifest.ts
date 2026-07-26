import manifestJson from "@/content/generated/slug-manifest.json";
import { SlugManifestSchema, type ProgressItemType } from "@/lib/contracts";

/**
 * ビルド時生成のslugマニフェスト(content/generated/slug-manifest.json、
 * `npm run validate:content`が生成、.gitignore対象)を静的importでバンドルする。
 * 02§3.1「itemSlugはビルド時に生成したslugマニフェストに対して照合」/
 * lib/content.tsはnode:fs依存でworkerdランタイム(Cloudflare Workers)非対応の
 * ため、リクエスト処理経路(このルート)からは直接importできない(T-000の制約、
 * docs/skeleton-notes.md)。そのためビルド時に書き出したJSONを静的importする。
 */
const manifest = SlugManifestSchema.parse(manifestJson);

const knownSlugs = new Set(manifest.entries.map((entry) => `${entry.itemType}:${entry.slug}`));

const slugsByModule = new Map<string, string[]>();
for (const entry of manifest.entries) {
  const list = slugsByModule.get(entry.module) ?? [];
  list.push(entry.slug);
  slugsByModule.set(entry.module, list);
}

export function isKnownSlug(itemType: ProgressItemType, itemSlug: string): boolean {
  return knownSlugs.has(`${itemType}:${itemSlug}`);
}

export function slugsForModule(moduleSlug: string): string[] {
  return slugsByModule.get(moduleSlug) ?? [];
}

/**
 * T-303 バッジ付与条件評価(モジュール修了判定)向け。slugsForModuleは
 * itemType情報を失うため(lesson/quiz/exerciseで同名slugが存在した場合に
 * 判別できない)、`${itemType}:${slug}`形式のキーで返す。isKnownSlugの
 * knownSlugsキー形式と揃えている。
 */
export function itemKeysForModule(moduleSlug: string): string[] {
  return manifest.entries
    .filter((entry) => entry.module === moduleSlug)
    .map((entry) => `${entry.itemType}:${entry.slug}`);
}

/**
 * T-112 ダッシュボード(GET /api/dashboard の overall.lessonsTotal)向け。
 * itemType別の全有効slug件数(マニフェスト全体)を返す。
 */
export function countSlugsByType(itemType: ProgressItemType): number {
  return manifest.entries.filter((entry) => entry.itemType === itemType).length;
}
