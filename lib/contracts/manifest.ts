import { z } from "zod";
import { ProgressItemTypeSchema } from "./api";

/**
 * ビルド時に生成するslugマニフェスト。
 * 参照設計: docs/design/02_詳細設計書.md §9(コンテンツビルドパイプライン生成物),
 * §3.1「itemSlugはビルド時に生成したslugマニフェスト(全有効slug集合)に対して照合」。
 *
 * PUT /api/progress の itemSlug 検証(未知slug→409)に用いる、
 * 有効な lesson/quiz/exercise slug の全集合。
 */
export const SlugManifestEntrySchema = z.object({
  itemType: ProgressItemTypeSchema,
  slug: z.string().min(1),
  /** 所属モジュールslug(例: '01-reliability') */
  module: z.string().min(1),
});
export type SlugManifestEntry = z.infer<typeof SlugManifestEntrySchema>;

export const SlugManifestSchema = z.object({
  generatedAt: z.string(),
  entries: z.array(SlugManifestEntrySchema),
});
export type SlugManifest = z.infer<typeof SlugManifestSchema>;
