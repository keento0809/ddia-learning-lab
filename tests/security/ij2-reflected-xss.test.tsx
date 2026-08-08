// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SearchPage } from "@/components/search/SearchPage";
import { createSearchIndex, exportSearchIndex } from "@/lib/search/flexIndex";

/**
 * T-703 IJ-2(docs/design/11_ADR-011 §3.3)。反射型XSS: 検索クエリ、エラーメッセージ。
 *
 * SearchPage(components/search/SearchPage.tsx)はURLの`q`クエリパラメータを
 * `initialQuery` propとして受け取り、常にReactの通常のJSXバインディング
 * (`<input value={inputValue}>`)経由でのみ扱う(dangerouslySetInnerHTMLは
 * このコンポーネント内に存在しない、リポジトリ全体grep済み)。本テストは
 * 実際に`<script>`/`<img onerror>`を含むクエリ文字列を`initialQuery`として
 * 渡し、レンダリング結果のDOMに未エスケープのタグとして出現しないことを
 * 実描画で確認する。
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/generated/search-index.ja.json", () => ({ default: exportSearchIndex(createSearchIndex("ja")) }));
vi.mock("@/lib/generated/search-index.en.json", () => ({ default: exportSearchIndex(createSearchIndex("en")) }));

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

async function renderSearchPage(root: Root, initialQuery: string): Promise<void> {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="ja" messages={{}}>
        <SearchPage locale="ja" initialQuery={initialQuery} />
      </NextIntlClientProvider>,
    );
  });
}

describe("IJ-2: 反射型XSS(検索クエリ)", () => {
  const XSS_PAYLOADS = [
    '<script>window.__xss_fired=true</script>',
    '<img src=x onerror="window.__xss_fired=true">',
    '"><svg onload="window.__xss_fired=true">',
    "javascript:alert(1)",
  ];

  for (const payload of XSS_PAYLOADS) {
    it(`initialQuery="${payload}" はDOMにスクリプト実行可能な形で挿入されない`, async () => {
      delete (window as unknown as { __xss_fired?: boolean }).__xss_fired;
      const { container, root } = mountContainer();

      await renderSearchPage(root, payload);

      // 実行されていればグローバルフラグが立つ(スクリプトタグ/イベントハンドラが
      // 実際に発火した場合の検出)。これが最も直接的な「攻撃が成立したか」の判定であり、
      // 生成後のHTML文字列中に"<script"や"onerror="という部分文字列が現れるかどうかは
      // 判定基準にしない(React/ブラウザの属性値エスケープにより、値がinput要素の
      // value属性内に安全に格納されている場合でもテキストとして"<script"や"onerror="が
      // 含まれ得るため、それ自体は誤検知になる。実際に危険なのは、それらが要素/属性の
      // 境界を越えて解釈されるかどうかである)。
      expect((window as unknown as { __xss_fired?: boolean }).__xss_fired).toBeUndefined();

      // SearchPage自身はscript/img/svg/iframeを一切描画しないため、これらの要素が
      // 1つでもDOM上に出現していればペイロードが属性値の境界を越えて新規要素として
      // 解釈された(=注入成立)ことを意味する。
      expect(container.querySelectorAll("script, img, svg, iframe").length).toBe(0);

      const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]');
      expect(input?.value).toBe(payload);
    });
  }
});

/**
 * IJ-2続き: エラーメッセージ(RFC 9457 Problem Detailsのtitle/detail)の反射型XSS。
 * components/auth/*, components/settings/* のフォーム群はサーバから返る
 * エラー文言を状態に保持して表示するため、その表示経路が常にJSXのテキスト
 * 補間(自動エスケープ)であり`dangerouslySetInnerHTML`を経由しないことを
 * ソースコード全体で確認する(コンポーネント単位で個別に描画テストするより、
 * 「この種のコンポーネント全体でdangerouslySetInnerHTMLパターン自体が
 * 存在しない」という不変条件を1テストで固定する方が、将来追加される
 * フォームに対しても回帰防止になる)。
 */
describe("IJ-2: 反射型XSS(エラーメッセージ表示)", () => {
  function listTsxFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTsxFiles(fullPath);
      return entry.name.endsWith(".tsx") ? [fullPath] : [];
    });
  }

  it("components/auth/**・components/settings/** はdangerouslySetInnerHTMLでエラー文言を描画しない", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    const targets = ["components/auth", "components/settings"];
    const offenders: string[] = [];
    for (const dir of targets) {
      for (const file of listTsxFiles(path.join(repoRoot, dir))) {
        const source = readFileSync(file, "utf-8");
        if (source.includes("dangerouslySetInnerHTML")) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
