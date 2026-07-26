import { partForOrder, type CurriculumModuleSummary, type CurriculumPart } from "@/lib/curriculum";
import { BadgeCriteriaSchema } from "./criteria";

/** badgesテーブルの1行分(このモジュールが必要とする最小限のフィールドのみ) */
export interface BadgeDefinition {
  slug: string;
  /** DBのjsonb列。未知/不正な形は安全側で「未充足」として扱う */
  criteria: unknown;
}

export interface BadgeEvaluationContext {
  modules: readonly CurriculumModuleSummary[];
  /** モジュールslugが持つ全item(`${itemType}:${itemSlug}`)キー一覧 */
  itemKeysForModule: (moduleSlug: string) => readonly string[];
  /** ユーザーが完了("done")済みのitemキー(`${itemType}:${itemSlug}`)集合 */
  doneItemKeys: ReadonlySet<string>;
}

function isPartComplete(part: CurriculumPart, ctx: BadgeEvaluationContext): boolean {
  const modulesInPart = ctx.modules.filter((mod) => partForOrder(mod.meta.order) === part);
  if (modulesInPart.length === 0) return false;

  return modulesInPart.every((mod) => {
    const itemKeys = ctx.itemKeysForModule(mod.meta.slug);
    return itemKeys.length > 0 && itemKeys.every((key) => ctx.doneItemKeys.has(key));
  });
}

/**
 * 02§2.1「criteria jsonbで付与条件を定義」/§3.1「newBadges」の評価本体。
 * 既に付与済み(alreadyGrantedSlugs)のバッジは除外し、criteria充足済みの
 * バッジslugを新規付与対象として返す(呼び出し側でuser_badges作成)。
 */
export function evaluateNewlyEarnedBadges(
  definitions: readonly BadgeDefinition[],
  alreadyGrantedSlugs: ReadonlySet<string>,
  ctx: BadgeEvaluationContext,
): string[] {
  const earned: string[] = [];
  for (const def of definitions) {
    if (alreadyGrantedSlugs.has(def.slug)) continue;

    const parsedCriteria = BadgeCriteriaSchema.safeParse(def.criteria);
    if (!parsedCriteria.success) continue;

    if (parsedCriteria.data.type === "part_complete" && isPartComplete(parsedCriteria.data.part, ctx)) {
      earned.push(def.slug);
    }
  }
  return earned;
}
