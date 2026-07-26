import { z } from "zod";

/**
 * badges.criteria(jsonb)のスキーマ。02§2.1「badges(id, slug, criteria jsonb)」。
 * 現時点で定義されている付与条件はPart修了のみ(02§3.1/§4.4の例に登場する
 * "part1-complete"/"part2-complete"のバッジ)。将来criteriaの種類が増える場合は
 * discriminated unionにtypeを追加する。
 */
export const PartCompleteCriteriaSchema = z.object({
  type: z.literal("part_complete"),
  part: z.enum(["I", "II", "III"]),
});
export type PartCompleteCriteria = z.infer<typeof PartCompleteCriteriaSchema>;

export const BadgeCriteriaSchema = PartCompleteCriteriaSchema;
export type BadgeCriteria = z.infer<typeof BadgeCriteriaSchema>;
