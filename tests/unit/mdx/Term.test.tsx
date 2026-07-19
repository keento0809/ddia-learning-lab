import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Term } from "@/components/mdx/Term";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

vi.mock("@/lib/glossary", () => ({
  getGlossaryEntry: (slug: string) =>
    slug === "latency"
      ? {
          slug: "latency",
          term: { ja: "レイテンシ", en: "latency" },
          definition: { ja: "遅延の説明(テスト用)。", en: "Latency explanation (test only)." },
        }
      : undefined,
}));

describe("Term", () => {
  it("renders only the children (no popover trigger) when the slug is not in the glossary", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Term slug="not-in-glossary">{"読み取り書き込み"}</Term>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("読み取り書き込み");
    expect(html).not.toContain("<button");
  });

  it("renders a popover trigger button when the slug resolves in the glossary", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Term slug="latency">{"レイテンシ"}</Term>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("<button");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("レイテンシ");
  });
});
