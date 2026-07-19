import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Callout } from "@/components/mdx/Callout";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

/**
 * T-103受入基準「各カスタムコンポーネントの描画テスト」。
 * Callout/Term/Viz/CodeBlock/QuizInline/BookRefはuseState/useContextを使う
 * Client Componentのため、既存の「関数を直接呼び出す」パターン(T-101/T-102、
 * hookなしのServer Component向け)が使えない(Invalid hook call)。
 * react-dom/server(既存依存、追加インストールなし)のrenderToStaticMarkupで
 * 実際のReactレンダーパスを通し、hookを正しく実行させる。
 */
describe("Callout", () => {
  it.each([
    ["ja", "info", "情報"],
    ["ja", "warn", "注意"],
    ["ja", "tip", "ヒント"],
    ["en", "info", "Info"],
    ["en", "warn", "Warning"],
    ["en", "tip", "Tip"],
  ] as const)("renders the %s label for type=%s (locale=%s)", (locale, type, expectedLabel) => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale={locale}>
        <Callout type={type}>{"本文テキスト"}</Callout>
      </LessonLocaleProvider>,
    );
    expect(html).toContain(expectedLabel);
    expect(html).toContain("本文テキスト");
    expect(html).toContain('role="note"');
  });

  it("defaults to type=info when omitted", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Callout>{"本文"}</Callout>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("情報");
  });

  it("throws when rendered outside of LessonLocaleProvider", () => {
    expect(() => renderToStaticMarkup(<Callout>{"本文"}</Callout>)).toThrow(
      /LessonLocaleProvider/,
    );
  });
});
