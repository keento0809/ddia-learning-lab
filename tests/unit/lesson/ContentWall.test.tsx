import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ContentWall } from "@/components/lesson/ContentWall";

/**
 * T-603(ADR-009 §3.2)。<ContentWall>が仕様の各要素
 * (鍵アイコン・価値訴求3項目・登録/サインイン/モジュール1へのCTA)を
 * ja/en両方で描画すること、およびPreview階層(previewHtmlあり)では
 * 冒頭HTML+フェードアウト演出を、Gated階層(previewHtmlなし)ではウォールのみを
 * 描画することを検証する。next-intlの`Link`(lib/i18n/navigation.ts)を実描画する
 * ため、ModuleDetail.test.tsxで確立済みのパターン(NextIntlClientProviderで包む)
 * を踏襲する。
 */
function renderWall(locale: "ja" | "en", previewHtml?: string) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}}>
      {ContentWall({ locale, previewHtml })}
    </NextIntlClientProvider>,
  );
}

describe("ContentWall", () => {
  it.each([["ja"], ["en"]] as const)(
    "Gated階層(previewHtmlなし)ではプレビューHTMLを描画しない(locale=%s)",
    (locale) => {
      const html = renderWall(locale);
      expect(html).toContain('data-testid="content-wall"');
      expect(html).toContain('data-testid="content-wall-box"');
      expect(html).not.toContain('data-testid="content-wall-preview"');
      expect(html).not.toContain('data-testid="content-wall-fade"');
    },
  );

  it.each([["ja"], ["en"]] as const)(
    "Preview階層(previewHtmlあり)では冒頭HTML+フェードアウトの上にウォールを描画する(locale=%s)",
    (locale) => {
      const html = renderWall(locale, "<p>冒頭のプレビュー本文</p>");
      expect(html).toContain('data-testid="content-wall-preview"');
      expect(html).toContain("冒頭のプレビュー本文");
      expect(html).toContain('data-testid="content-wall-fade"');
      expect(html).toContain('data-testid="content-wall-box"');
    },
  );

  it("ja: 鍵アイコン・価値訴求3項目・CTA・モジュール1導線を描画する", () => {
    const html = renderWall("ja");
    expect(html).toContain('data-testid="content-wall-lock-icon"');
    expect(html).toContain("続きを読むには無料登録が必要です");
    expect(html).toContain('data-testid="content-wall-value-props"');
    expect(html).toContain("全12モジュールの教材が読み放題");
    expect(html).toContain("演習の実行と自動採点");
    expect(html).toContain("学習進捗の保存とバッジ");
    expect(html).toContain('data-testid="content-wall-cta-signup"');
    expect(html).toContain('href="/ja/auth/signup"');
    expect(html).toContain('data-testid="content-wall-cta-signin"');
    expect(html).toContain('href="/ja/auth/signin"');
    expect(html).toContain('data-testid="content-wall-free-tier-link"');
    // Free Tier(ADR-009 §3.1)はorder最小のモジュール(現状01-reliability)
    expect(html).toContain('href="/ja/learn/01-reliability"');
    expect(html).toContain("モジュール1は登録なしで全部読めます");
  });

  it("en: renders lock icon, 3 value props, CTAs, and the free-tier link", () => {
    const html = renderWall("en");
    expect(html).toContain('data-testid="content-wall-lock-icon"');
    expect(html).toContain("Sign up for free to keep reading");
    expect(html).toContain("Unlimited access to all 12 modules");
    expect(html).toContain("Run exercises with automatic grading");
    expect(html).toContain("Saved progress and badges");
    expect(html).toContain('href="/en/auth/signup"');
    expect(html).toContain('href="/en/auth/signin"');
    expect(html).toContain('href="/en/learn/01-reliability"');
    expect(html).toContain("Module 1 is free to read in full, no sign-up needed");
  });
});
