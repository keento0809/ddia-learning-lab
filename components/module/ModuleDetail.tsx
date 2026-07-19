import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import {
  buildModuleToc,
  nextItemHref,
  tocItemHref,
  tocItemKey,
  type ModuleDetailSummary,
  type ModuleTocItem,
} from "@/lib/moduleDetail";

/**
 * S-03 モジュール詳細(02§7.7画面一覧, 03文書T-102)。
 * レッスン/クイズ/演習の目次、所要時間合計(module.yamlのminutes)、
 * 次アイテム導線(目次先頭へのCTA。進捗連動はT-105)を描画する。
 */
export function ModuleDetail({
  locale,
  detail,
}: {
  locale: Locale;
  detail: ModuleDetailSummary;
}) {
  const messages = getMessages(locale);
  const t = messages.moduleDetail;
  const toc = buildModuleToc(detail);
  const nextHref = nextItemHref(detail.meta.slug, toc);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">{detail.meta.title}</h1>
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
              <ModuleTocRow locale={locale} moduleSlug={detail.meta.slug} item={item} />
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
}: {
  locale: Locale;
  moduleSlug: string;
  item: ModuleTocItem;
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
      {item.kind === "lesson" ? (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {formatMessage(messages.curriculum.minutesLabel, { minutes: item.minutes })}
        </span>
      ) : null}
    </Link>
  );
}
