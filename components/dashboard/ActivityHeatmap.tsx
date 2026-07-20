import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { HeatmapDay } from "@/lib/dashboard/heatmap";

const INTENSITY_CLASSES = [
  "bg-neutral-100 dark:bg-neutral-900",
  "bg-neutral-300 dark:bg-neutral-700",
  "bg-neutral-500 dark:bg-neutral-500",
  "bg-neutral-900 dark:bg-neutral-200",
] as const;

function intensityClass(count: number): string {
  if (count <= 0) return INTENSITY_CLASSES[0];
  if (count === 1) return INTENSITY_CLASSES[1];
  if (count === 2) return INTENSITY_CLASSES[2];
  return INTENSITY_CLASSES[3];
}

/**
 * S-07「ヒートマップ型学習カレンダー(直近12週)」(02§4.4中段)。
 * lib/dashboard/heatmap.tsが算出した日別カウント(84日、日付昇順)を週ごとの列
 * (7日)に折り返して描画する(GitHubの草グラフと同じレイアウト方向)。
 */
export function ActivityHeatmap({ locale, days }: { locale: Locale; days: readonly HeatmapDay[] }) {
  const t = getMessages(locale).dashboard.heatmap;
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <section aria-labelledby="dashboard-heatmap-heading" data-testid="dashboard-heatmap" className="mb-6">
      <h2 id="dashboard-heatmap-heading" className="mb-3 text-lg font-semibold">
        {t.heading}
      </h2>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((week, weekIndex) => (
          <div key={week[0]?.date ?? weekIndex} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                role="img"
                aria-label={formatMessage(t.cellAriaLabel, { date: day.date, count: day.count })}
                data-testid="dashboard-heatmap-cell"
                className={`h-3 w-3 rounded-sm ${intensityClass(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
