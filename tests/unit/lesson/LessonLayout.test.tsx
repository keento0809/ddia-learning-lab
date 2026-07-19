import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LessonLayout } from "@/components/lesson/LessonLayout";
import type { ModuleTocItem } from "@/lib/moduleDetail";

// next-intlのuseRouterはNext.jsのApp Routerコンテキスト(RouterContext)への
// マウントを要求し、renderToStaticMarkupの単純な描画パスには存在しない
// (「invariant expected app router to be mounted」)。LessonLayoutは
// 「完了して次へ」成功後の遷移にuseRouterを使う(T-105)ため、Linkの実装は
// 保ったままuseRouterのみをこのテスト用にモックする(vi.mockはホイストされる
// ためimport文より後に書いても問題ない)。
vi.mock("@/lib/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/i18n/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn() }) };
});

const TOC: ModuleTocItem[] = [
  { kind: "lesson", id: "01-intro", title: "はじめに", minutes: 10 },
  { kind: "lesson", id: "02-percentiles", title: "パーセンタイル", minutes: 15 },
  { kind: "quiz" },
];

function DummyContent() {
  return (
    <div>
      <h2>{"見出し1"}</h2>
      <p>{"本文"}</p>
    </div>
  );
}

/**
 * T-103受入基準「3カラムレイアウト(左目次/本文/右ページ内目次)」の描画確認。
 * LessonLayoutはZustand(useLessonLayoutStore)・useScrollThresholdなどの
 * hookを使うClient Componentのため、react-dom/serverで実レンダーパスを通す。
 * T-105でuseProgressQuery/useMarkProgressMutation(TanStack Query)を使う
 * ようになったため、QueryClientProviderで包む(staleTime:Infinityにして
 * このSSR経路で実ネットワークfetchを発生させない)。
 * モバイルドロワーの開閉操作自体(クリックイベント)はSSRでは検証できないため、
 * verify-webappスキルでの実ブラウザ確認に委ねる(初期状態の描画のみここで検証)。
 */
describe("LessonLayout", () => {
  it("renders module TOC, breadcrumb, title, MDX content, prev nav and the complete-and-next button", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        <QueryClientProvider client={queryClient}>
          <LessonLayout
            locale="ja"
            moduleSlug="01-reliability"
            lessonId="01-intro"
            moduleTitle="信頼性の基礎"
            lessonTitle="はじめに"
            minutes={10}
            toc={TOC}
            currentKey="lesson-01-intro"
            prevHref={null}
            nextHref="/learn/01-reliability/02-percentiles"
            isAuthenticated={false}
          >
            <DummyContent />
          </LessonLayout>
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-testid="lesson-left-pane"');
    expect(html).toContain('data-testid="lesson-right-pane"');
    expect(html).toContain('data-testid="lesson-article"');
    expect(html).toContain("信頼性の基礎");
    expect(html).toContain("はじめに");
    expect(html).toContain("見出し1");
    expect(html).toContain('data-testid="lesson-complete-next"');
    expect(html).toContain("完了して次へ");
    expect(html).not.toContain('data-testid="lesson-prev-link"');
    expect(html).toContain('data-testid="open-module-toc-drawer"');
    expect(html).toContain('data-testid="open-page-toc-drawer"');
  });
});
