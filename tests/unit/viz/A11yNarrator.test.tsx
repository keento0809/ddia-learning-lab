import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import type { A11yNarratable } from "@/lib/contracts";

interface CounterState {
  count: number;
}

const counterNarratable: A11yNarratable<CounterState> = {
  describeState: (state, locale) =>
    locale === "ja" ? `カウント: ${state.count}` : `Count: ${state.count}`,
};

/**
 * T-203成果物「A11yNarrator(aria-live、describeState(state, locale)規約)」の
 * 基本レンダー検証。実際のスクリーンリーダー読み上げ確認はverify-webappの
 * 実ブラウザ検証に委ねる。
 */
describe("A11yNarrator", () => {
  it("renders describeState output inside an aria-live status region", () => {
    const html = renderToStaticMarkup(
      <A11yNarrator state={{ count: 2 }} locale="ja" narratable={counterNarratable} />,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain("カウント: 2");
  });

  it("delegates locale-specific copy to describeState", () => {
    const html = renderToStaticMarkup(
      <A11yNarrator state={{ count: 5 }} locale="en" narratable={counterNarratable} />,
    );
    expect(html).toContain("Count: 5");
  });

  it("supports an assertive politeness override", () => {
    const html = renderToStaticMarkup(
      <A11yNarrator
        state={{ count: 0 }}
        locale="ja"
        narratable={counterNarratable}
        politeness="assertive"
      />,
    );
    expect(html).toContain('aria-live="assertive"');
  });
});
