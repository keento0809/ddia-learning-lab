import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { LessonLayout } from "@/components/lesson/LessonLayout";
import type { ModuleTocItem } from "@/lib/moduleDetail";

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
 * モバイルドロワーの開閉操作自体(クリックイベント)はSSRでは検証できないため、
 * verify-webappスキルでの実ブラウザ確認に委ねる(初期状態の描画のみここで検証)。
 */
describe("LessonLayout", () => {
  it("renders module TOC, breadcrumb, title, MDX content and prev/next navigation", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="ja" messages={{}}>
        <LessonLayout
          locale="ja"
          moduleSlug="01-reliability"
          moduleTitle="信頼性の基礎"
          lessonTitle="はじめに"
          minutes={10}
          toc={TOC}
          currentKey="lesson-01-intro"
          prevHref={null}
          nextHref="/learn/01-reliability/02-percentiles"
        >
          <DummyContent />
        </LessonLayout>
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-testid="lesson-left-pane"');
    expect(html).toContain('data-testid="lesson-right-pane"');
    expect(html).toContain('data-testid="lesson-article"');
    expect(html).toContain("信頼性の基礎");
    expect(html).toContain("はじめに");
    expect(html).toContain("見出し1");
    expect(html).toContain('data-testid="lesson-next-link"');
    expect(html).not.toContain('data-testid="lesson-prev-link"');
    expect(html).toContain('data-testid="open-module-toc-drawer"');
    expect(html).toContain('data-testid="open-page-toc-drawer"');
  });
});
