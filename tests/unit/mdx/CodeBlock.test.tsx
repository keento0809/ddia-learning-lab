import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "@/components/mdx/CodeBlock";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";

describe("CodeBlock", () => {
  it("renders the highlighted code block without a try button when runnable is omitted", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <CodeBlock lang="js">{"const x = 1;"}</CodeBlock>
      </LessonLocaleProvider>,
    );
    expect(html).toContain("const x = 1;");
    expect(html).toContain('data-lang="js"');
    expect(html).not.toContain('data-testid="code-block-try"');
  });

  it("renders a try button when runnable, with the result panel collapsed initially", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <CodeBlock lang="js" runnable>
          {"const x = 1;"}
        </CodeBlock>
      </LessonLocaleProvider>,
    );
    expect(html).toContain('data-testid="code-block-try"');
    expect(html).toContain("試す");
    expect(html).not.toContain('data-testid="code-block-result"');
  });
});
