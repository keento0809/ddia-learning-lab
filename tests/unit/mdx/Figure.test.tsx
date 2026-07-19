import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Figure } from "@/components/mdx/Figure";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

describe("Figure", () => {
  it("renders the image with alt text and no caption when captionKey is omitted", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Figure src="/images/example.png" alt="説明用の代替テキスト" />
      </LessonLocaleProvider>,
    );
    expect(html).toContain("/images/example.png");
    expect(html).toContain("説明用の代替テキスト");
    expect(html).not.toContain("<figcaption");
  });

  it("renders no caption when captionKey does not resolve (no glossary/figure content authored yet)", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Figure src="/images/example.png" alt="alt" captionKey="unregistered-caption" />
      </LessonLocaleProvider>,
    );
    expect(html).not.toContain("<figcaption");
  });
});
