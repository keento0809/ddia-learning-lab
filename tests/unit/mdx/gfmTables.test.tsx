import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { useMDXComponents } from "@/mdx-components";
import { mdxRemarkPlugins } from "@/next.config";

const repoRoot = path.resolve(__dirname, "../../..");

const tableLessons = [
  "content/ja/02-data-models/03-normalization-denormalization.mdx",
  "content/en/02-data-models/03-normalization-denormalization.mdx",
  "content/ja/04-encoding/04-dataflow-modes.mdx",
  "content/en/04-encoding/04-dataflow-modes.mdx",
  "content/ja/10-batch-processing/02-join-strategies.mdx",
  "content/en/10-batch-processing/02-join-strategies.mdx",
] as const;

describe("remark-gfm: レッスンMDX内のテーブル記法が<table>要素へレンダリングされる", () => {
  it.each(tableLessons)("%sをコンパイル・レンダリングすると<table>要素が生成される", async (relativePath) => {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf-8");
    const locale = relativePath.startsWith("content/ja/") ? "ja" : "en";

    const { default: Content } = await evaluate(source, {
      ...runtime,
      remarkPlugins: mdxRemarkPlugins,
      useMDXComponents: () => useMDXComponents({}),
    });

    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale={locale}>
        <Content />
      </LessonLocaleProvider>,
    );

    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
  });
});
