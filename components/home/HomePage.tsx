import { auth } from "@/lib/auth/config";
import { Link } from "@/lib/i18n/navigation";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import {
  CURRICULUM_PARTS,
  groupModulesByPart,
  type CurriculumModuleSummary,
} from "@/lib/curriculum";

/**
 * S-01 ランディング(01_基本設計書.md §7.1「価値訴求、カリキュラム概観、CTA」)。
 * 03_実装タスク分割書.md のタスクDAGにS-01が含まれておらず(T-101から開始)、
 * `app/[locale]/page.tsx` 自体が未実装のまま`/{locale}`が404を返していたため、
 * T-100として本タスクを起票し実装した(STATUS.md 決定事項ログ参照)。
 *
 * ログイン中でもヒーローの登録導線(ctaSecondary→/auth/signup)がそのまま
 * 表示され、既存ユーザーに再登録を促していたため、認証状態をここで直接
 * auth()から取得し、続行導線(→/dashboard)に出し分ける(強制リダイレクトは
 * シェアURL/ADR-009のPublic設計を損なうため不採用)。
 */
export async function HomePage({
  locale,
  modules,
}: {
  locale: Locale;
  modules: readonly CurriculumModuleSummary[];
}) {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);
  const t = getMessages(locale).home;
  const curriculumT = getMessages(locale).curriculum;
  const grouped = groupModulesByPart(modules);
  const secondaryCta = isAuthenticated
    ? { href: "/dashboard" as const, label: t.ctaSecondaryAuthenticated }
    : { href: "/auth/signup" as const, label: t.ctaSecondary };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <section className="flex flex-col gap-4 py-8 text-center">
        <h1 className="text-3xl font-semibold">{t.heroTitle}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{t.heroSubtitle}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/learn"
            data-testid="home-cta-primary"
            className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {t.ctaPrimary}
          </Link>
          <Link
            href={secondaryCta.href}
            data-testid="home-cta-secondary"
            className="rounded border border-neutral-300 px-4 py-2 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {secondaryCta.label}
          </Link>
        </div>
      </section>

      <section aria-labelledby="home-curriculum-overview" className="py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="home-curriculum-overview" className="text-lg font-semibold">
            {t.curriculumOverviewTitle}
          </h2>
          <Link href="/learn" className="text-sm hover:underline">
            {t.viewAllLink}
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {CURRICULUM_PARTS.map((part) => (
            <li
              key={part}
              data-testid={`home-part-${part}`}
              className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <p className="font-medium">{curriculumT.parts[part].title}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {formatMessage(t.moduleCountLabel, { count: grouped[part].length })}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
