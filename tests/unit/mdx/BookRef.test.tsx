import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookRef } from "@/components/mdx/BookRef";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

describe("BookRef", () => {
  it("renders the bibliographic card with title, author and chapter number (ja)", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <BookRef chapter={5} />
      </LessonLocaleProvider>,
    );
    expect(html).toContain("Designing Data-Intensive Applications");
    expect(html).toContain("Martin Kleppmann");
    expect(html).toContain("第5章");
  });

  it("renders the bibliographic card in English", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="en">
        <BookRef chapter={9} />
      </LessonLocaleProvider>,
    );
    expect(html).toContain("Chapter 9");
  });
});
