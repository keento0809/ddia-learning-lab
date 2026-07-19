import type { CurriculumModuleSummary } from "@/lib/curriculum";
import type { DashboardModuleProgress, ProgressRecord } from "@/lib/contracts";

/**
 * S-02 カリキュラム一覧(T-101のModuleCard/ProgressRing)向けに、GET /api/progress
 * の生レコードからモジュールごとの進捗率を算出する(T-105)。
 *
 * CurriculumModuleSummary(lib/curriculum.ts)はlessonCountのみを持ち
 * quiz/exercise件数を持たないため(T-101のビルド時生成物の範囲)、ここでの
 * 進捗率はレッスン完了数を分母とする(S-03のモジュール詳細ページはlib/moduleDetail.ts
 * のTOC全件を分母にしたより精密な進捗率を別途算出する)。
 */
export function computeCurriculumProgress(
  modules: readonly CurriculumModuleSummary[],
  records: readonly ProgressRecord[],
): DashboardModuleProgress[] {
  return modules.map((mod) => {
    const total = mod.lessonCount;
    if (total <= 0) {
      return { slug: mod.meta.slug, percent: 0 };
    }
    const prefix = `${mod.meta.slug}/`;
    const done = records.filter(
      (record) =>
        record.itemType === "lesson" &&
        record.status === "done" &&
        record.itemSlug.startsWith(prefix),
    ).length;
    return { slug: mod.meta.slug, percent: Math.round((Math.min(done, total) / total) * 100) };
  });
}
