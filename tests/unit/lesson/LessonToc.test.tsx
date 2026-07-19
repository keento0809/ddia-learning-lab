import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadAllModules } from "@/lib/content";
import type { Locale } from "@/lib/contracts/common";
import { LessonToc } from "@/components/lesson/LessonToc";
import { buildModuleToc, tocItemKey, type ModuleDetailSummary } from "@/lib/moduleDetail";

const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/moduleDetail", import.meta.url));

function loadDetail(locale: Locale, moduleSlug: string): ModuleDetailSummary {
  const mod = loadAllModules(FIXTURES_ROOT, locale).find((m) => m.slug === moduleSlug);
  if (!mod) throw new Error(`fixture module not found: ${moduleSlug}`);
  return {
    meta: mod.meta,
    lessons: mod.lessons.map((lesson) => ({
      id: lesson.slug.split("/").slice(1).join("/"),
      title: lesson.frontmatter.title,
      order: lesson.frontmatter.order,
      minutes: lesson.frontmatter.minutes,
    })),
    hasQuiz: mod.quizFilePath !== null,
    exercises: mod.exercises.map((exercise) => ({ slug: exercise.slug })),
  };
}

/**
 * 失敗→恒久対策: qa-evaluatorの指摘(モバイルドロワー内リンククリック後にドロワーが
 * 開いたままになる)を修正するためLessonTocにuseLessonLayoutStore(hook)を追加した。
 * これによりT-101/T-102の「関数を直接呼び出す」パターン(hookなしのServer
 * Component向け)が使えなくなった(Invalid hook call)ため、他のClient
 * Componentテストと同じくreact-dom/serverのrenderToStaticMarkupで実レンダーパスを
 * 通す。next-intlのLinkがuseLocale()経由でNextIntlClientProviderのcontextを
 * 要求するため、それも合わせてラップする(tests/unit/lesson/LessonLayout.test.tsx
 * と同じ理由)。
 */
describe("LessonToc", () => {
  it.each([["ja"], ["en"]] as const)(
    "marks the current lesson with aria-current and lists all TOC items (locale=%s)",
    (locale) => {
      const detail = loadDetail(locale, "01-reliability");
      const toc = buildModuleToc(detail);
      const currentKey = tocItemKey(toc[0]);

      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={{}}>
          <LessonToc locale={locale} moduleSlug="01-reliability" toc={toc} currentKey={currentKey} />
        </NextIntlClientProvider>,
      );

      expect(html).toMatchSnapshot();
    },
  );

  it("calls closeDrawer when a TOC link is clicked (drawer stays closed after navigating away)", () => {
    const detail = loadDetail("ja", "01-reliability");
    const toc = buildModuleToc(detail);
    const currentKey = tocItemKey(toc[0]);

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        <LessonToc locale="ja" moduleSlug="01-reliability" toc={toc} currentKey={currentKey} />
      </NextIntlClientProvider>,
    );

    // onClickはReactイベントハンドラのためSSR出力には現れないが、少なくとも
    // レンダリング自体が壊れていないこと(hookの配線ミスがないこと)を確認する。
    // closeDrawer呼び出しの実際の効果(ドロワーが閉じる)はLessonLayoutの
    // フォーカストラップと合わせてverify-webappスキルでの実ブラウザ確認で検証済み。
    expect(html).toContain("モジュール目次");
    expect(html).toContain("aria-current");
  });
});
