import { getMessages, type Locale } from "@/lib/i18n/messages";
import { CURRICULUM_PARTS, groupModulesByPart, type CurriculumModuleSummary } from "@/lib/curriculum";
import type { DashboardModuleProgress } from "@/lib/contracts";

/**
 * S-07「Part別進捗バー」(02§4.4中段)。GET /api/dashboardのmodules(モジュール別
 * 進捗率、02§3.1)を、lib/curriculum.tsのPart区分(T-101既存、orderの範囲から
 * 導出)で集約し、Partごとの平均進捗率をバー表示する。
 */
export function PartProgressBars({
  locale,
  modules,
  progress,
}: {
  locale: Locale;
  modules: readonly CurriculumModuleSummary[];
  progress: readonly DashboardModuleProgress[];
}) {
  const t = getMessages(locale);
  const grouped = groupModulesByPart(modules);
  const percentBySlug = new Map(progress.map((entry) => [entry.slug, entry.percent]));

  return (
    <section aria-labelledby="dashboard-parts-heading" data-testid="dashboard-part-progress" className="mb-6">
      <h2 id="dashboard-parts-heading" className="mb-3 text-lg font-semibold">
        {t.dashboard.parts.heading}
      </h2>
      <ul className="flex flex-col gap-3">
        {CURRICULUM_PARTS.map((part) => {
          const partModules = grouped[part];
          if (partModules.length === 0) {
            return null;
          }
          const percents = partModules.map((mod) => percentBySlug.get(mod.meta.slug) ?? 0);
          const average = Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length);
          return (
            <li key={part} data-testid={`dashboard-part-${part}`}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{t.curriculum.parts[part].title}</span>
                <span>{`${average}%`}</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-2 rounded-full bg-neutral-900 dark:bg-neutral-100"
                  style={{ width: `${average}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
