import { getLessonAccessTier } from "@/lib/contracts/access";

/**
 * T-603(ADR-009 §3.2、層4「UI」)。S-02/S-03の鍵アイコン表示可否を判定する
 * ためだけのUI専用ヘルパー。判定ロジック自体(層1)は変更せず、T-602の
 * `getLessonAccessTier`(lib/contracts/access.ts)を呼び出すのみ。
 * モジュール全体が(レッスン・クイズ・演習を問わず)Free Tierかどうかは、
 * そのモジュールの「lessonOrder=1」判定がfreeTierになるかで分かる
 * (freeTierはmoduleOrderのみで決まり、lessonOrderに依存しないため)。
 */
export function isModuleFullyFree(moduleOrder: number): boolean {
  return (
    getLessonAccessTier({
      moduleSlug: "",
      moduleOrder,
      lessonSlug: "",
      lessonOrder: 1,
    }) === "freeTier"
  );
}
