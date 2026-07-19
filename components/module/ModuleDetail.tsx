import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { ProgressRing } from "@/components/curriculum/ProgressRing";
import {
  buildModuleToc,
  nextItemHref,
  tocItemHref,
  tocItemKey,
  tocItemSlug,
  type ModuleDetailSummary,
  type ModuleTocItem,
} from "@/lib/moduleDetail";
import type { ProgressRecord, ProgressStatus } from "@/lib/contracts";

/**
 * S-03 モジュール詳細(02§7.7画面一覧, 03文書T-102)。
 * レッスン/クイズ/演習の目次、所要時間合計(module.yamlのminutes)、
 * 次アイテム導線を描画する。
 *
 * `progress`は実データ接続(T-105、GET /api/progressのZustandキャッシュから
 * オーバーレイ)向けのpropで、省略時は全アイテム未着手として描画する
 * (T-102時点の挙動と同一)。このコンポーネント自体はhookを使わない純粋な
 * 関数のまま保つ(tests/unit/module/ModuleDetail.test.tsxの「フックを使わない
 * 関数コンポーネントを直接呼び出す」パターンとの整合、実データ取得は
 * components/module/ModuleDetailWithProgress.tsxが担う)。
 */
export function ModuleDetail({
  locale,
  detail,
  progress = [],
}: {
  locale: Locale;
  detail: ModuleDetailSummary;
  progress?: readonly ProgressRecord[];
}) {
  const messages = getMessages(locale);
  const t = messages.moduleDetail;
  const toc = buildModuleToc(detail);
  const statusBySlug = new Map(progress.map((record) => [record.itemSlug, record.status]));
  const doneSlugs = new Set(
    progress.filter((record) => record.status === "done").map((record) => record.itemSlug),
  );
  const nextHref = nextItemHref(detail.meta.slug, toc, doneSlugs);
  const doneCount = toc.filter((item) => doneSlugs.has(tocItemSlug(detail.meta.slug, item))).length;
  const progressPercent = toc.length > 0 ? Math.round((doneCount / toc.length) * 100) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{detail.meta.title}</h1>
        {toc.length > 0 ? (
          <ProgressRing
            percent={progressPercent}
            label={formatMessage(messages.curriculum.progressAriaLabel, {
              percent: progressPercent,
            })}
          />
        ) : null}
      </div>
      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        {formatMessage(t.totalMinutesLabel, { minutes: detail.meta.minutes })}
      </p>
      {nextHref ? (
        <Link
          href={nextHref}
          prefetch={false}
          data-testid="module-detail-next-item"
          className="mb-6 inline-block rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {t.nextItemLabel}
        </Link>
      ) : null}
      <h2 className="mb-3 text-lg font-semibold">{t.tocHeading}</h2>
      {toc.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">{t.emptyLabel}</p>
      ) : (
        <ol data-testid="module-detail-toc" className="flex flex-col gap-1">
          {toc.map((item) => (
            <li key={tocItemKey(item)}>
              <ModuleTocRow
                locale={locale}
                moduleSlug={detail.meta.slug}
                item={item}
                status={statusBySlug.get(tocItemSlug(detail.meta.slug, item))}
              />
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function tocItemLabel(item: ModuleTocItem, t: ReturnType<typeof getMessages>["moduleDetail"]): string {
  if (item.kind === "lesson") return item.title;
  if (item.kind === "quiz") return t.quizItemLabel;
  return formatMessage(t.exerciseItemLabel, { index: item.index });
}

function ModuleTocRow({
  locale,
  moduleSlug,
  item,
  status,
}: {
  locale: Locale;
  moduleSlug: string;
  item: ModuleTocItem;
  status?: ProgressStatus;
}) {
  const messages = getMessages(locale);

  return (
    <Link
      href={tocItemHref(moduleSlug, item)}
      prefetch={false}
      data-testid={`module-toc-${tocItemKey(item)}`}
      className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
    >
      <span>{tocItemLabel(item, messages.moduleDetail)}</span>
      <span className="flex items-center gap-2">
        {status ? (
          <span
            data-testid={`module-toc-status-${tocItemKey(item)}`}
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            {status === "done" ? messages.moduleDetail.itemStatus.done : messages.moduleDetail.itemStatus.inProgress}
          </span>
        ) : null}
        {item.kind === "lesson" ? (
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatMessage(messages.curriculum.minutesLabel, { minutes: item.minutes })}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
