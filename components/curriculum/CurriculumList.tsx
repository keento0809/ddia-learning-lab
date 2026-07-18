import { getMessages, type Locale } from "@/lib/i18n/messages";
import {
  CURRICULUM_PARTS,
  groupModulesByPart,
  type CurriculumModuleSummary,
} from "@/lib/curriculum";
import type { DashboardModuleProgress } from "@/lib/contracts/api";
import { ModuleCard } from "./ModuleCard";
import { OrderConnector } from "./OrderConnector";

/**
 * S-02 カリキュラム一覧(02§4.3, 03文書T-101)。
 * 3部(Part I〜III)へのセクション分割、module.yamlスキーマ(lib/contracts/module.ts)
 * に基づくカード描画、ロック無し+推奨順の矢印表示。
 * 進捗リングはprops注入のみ(`progress`省略時は全モジュール0%)。実データ接続は
 * T-105(GET /api/progressのZustandキャッシュからのオーバーレイ)で行う。
 */
export function CurriculumList({
  locale,
  modules,
  progress = [],
}: {
  locale: Locale;
  modules: readonly CurriculumModuleSummary[];
  progress?: readonly DashboardModuleProgress[];
}) {
  const t = getMessages(locale).curriculum;
  const grouped = groupModulesByPart(modules);
  const progressBySlug = new Map(progress.map((p) => [p.slug, p.percent]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      {CURRICULUM_PARTS.map((part) => {
        const partModules = grouped[part];
        if (partModules.length === 0) {
          return null;
        }
        const headingId = `curriculum-part-${part}`;
        return (
          <section key={part} aria-labelledby={headingId} className="mb-8">
            <h2 id={headingId} className="mb-3 text-lg font-semibold">
              {t.parts[part].title}
            </h2>
            <ul data-testid={`curriculum-part-${part}-list`} className="flex flex-col gap-1">
              {partModules.flatMap((mod, index) => {
                const card = (
                  <ModuleCard
                    key={mod.meta.slug}
                    locale={locale}
                    meta={mod.meta}
                    lessonCount={mod.lessonCount}
                    progressPercent={progressBySlug.get(mod.meta.slug) ?? 0}
                  />
                );
                if (index === 0) {
                  return [card];
                }
                return [<OrderConnector key={`${mod.meta.slug}-connector`} />, card];
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
