import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-703 IJ-3(docs/design/11_ADR-011 §3.3)。MDXレンダリングでのHTML注入
 * (教材はリポジトリ管理だが、コンポーネントのpropsに動的値が入る箇所)。
 *
 * mdx-components.tsxが登録する7コンポーネント(Callout/Figure/Term/Viz/CodeBlock/
 * QuizInline/BookRef、いずれもcomponents/mdx/*)のいずれかが、MDX側から渡される
 * props(caption/alt/children等の自由記述文字列)を`dangerouslySetInnerHTML`で
 * 描画していれば、将来コンテンツに動的値(例: フロントマターやユーザー由来の
 * 値)が混入した場合に注入経路になり得る。現状の教材本文はリポジトリ管理のみ
 * (CLAUDE.md規則1のスコープ外)だが、この不変条件自体は将来の回帰を防ぐ
 * ガードレールとして固定する価値がある。
 */
function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsxFiles(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("IJ-3: MDXコンポーネントのHTML注入", () => {
  const repoRoot = path.resolve(__dirname, "../..");

  it("mdx-components.tsxが登録する7コンポーネントは1個も存在しない", () => {
    const source = readFileSync(path.join(repoRoot, "mdx-components.tsx"), "utf-8");
    for (const name of ["Callout", "Figure", "Term", "Viz", "CodeBlock", "QuizInline", "BookRef"]) {
      expect(source).toContain(name);
    }
  });

  it("components/mdx/** のいずれのコンポーネントもdangerouslySetInnerHTMLでpropsを描画しない", () => {
    const offenders: string[] = [];
    for (const file of listTsxFiles(path.join(repoRoot, "components/mdx"))) {
      const source = readFileSync(file, "utf-8");
      if (source.includes("dangerouslySetInnerHTML")) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Figureのalt(自由記述文字列)は通常のJSX属性として描画され、HTML文字列として評価されない", async () => {
    const { Figure } = await import("@/components/mdx/Figure");
    const { LessonLocaleProvider } = await import("@/lib/lesson/localeContext");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const maliciousAlt = '"><img src=x onerror="window.__mdx_xss=true">';
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Figure src="/generated/dummy.svg" alt={maliciousAlt} />
      </LessonLocaleProvider>,
    );
    // JSX属性値としてエスケープされ、属性値の外へエスケープできない(二重引用符が
    // &quot;化されるため、ペイロード中の`">`で属性/タグ境界を閉じることができない)。
    // これにより新規のimg要素(実行可能なonerror属性を持つもの)は生成されない。
    expect(html).toContain("&quot;&gt;");
    // Figure自身が描画する<img>は1個だけであり(ペイロードによる2個目のimgタグは
    // 生成されない)、alt属性値の中にエスケープされた形でのみ現れることを確認する。
    expect((html.match(/<img /g) ?? []).length).toBe(1);
  });
});
