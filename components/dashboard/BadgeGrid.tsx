import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { Badge } from "@/lib/contracts";

/**
 * S-07「バッジグリッド(未取得はシルエット)」(02§4.4下段)。
 * 03文書T-112受入基準「バッジ枠はシルエットのみ(T-303)」: 実際の付与条件表示・
 * バッジカタログはT-303のスコープのため、ここでは固定枠数の枠に獲得済み
 * バッジ(GET /api/dashboardのbadges、現時点では常に空)を先頭から埋め、
 * 残りをシルエットとして描画するのみに留める。
 */
const BADGE_GRID_SIZE = 4;

export function BadgeGrid({ locale, badges }: { locale: Locale; badges: readonly Badge[] }) {
  const t = getMessages(locale).dashboard.badges;
  const slotCount = Math.max(BADGE_GRID_SIZE, badges.length);
  const slots = Array.from({ length: slotCount }, (_, index) => badges[index] ?? null);

  return (
    <section aria-labelledby="dashboard-badges-heading" data-testid="dashboard-badges" className="mb-6">
      <h2 id="dashboard-badges-heading" className="mb-3 text-lg font-semibold">
        {t.heading}
      </h2>
      <ul className="flex flex-wrap gap-3">
        {slots.map((badge, index) =>
          badge ? (
            <li
              key={badge.slug}
              aria-label={formatMessage(t.grantedAriaLabel, { slug: badge.slug })}
              data-testid="dashboard-badge-granted"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 p-1 text-center text-[10px] text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {badge.slug}
            </li>
          ) : (
            <li
              key={`locked-${index}`}
              aria-label={t.lockedAriaLabel}
              data-testid="dashboard-badge-locked"
              className="h-16 w-16 rounded-full bg-neutral-200 dark:bg-neutral-800"
            />
          ),
        )}
      </ul>
    </section>
  );
}
