import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Viz, VizBoundary, VizErrorFallback } from "@/components/mdx/Viz";
import { LessonLocaleProvider } from "@/lib/lesson/localeContext";
import { resolveVizComponent, VIZ_REGISTRY } from "@/components/viz/registry";

/**
 * T-103受入基準「Vizは未登録名でError Boundaryにフォールバックすること」。
 *
 * 設計判断: componentDidCatch/getDerivedStateFromError(クラスコンポーネントの
 * commitフェーズライフサイクル)は、react-dom/serverの同期SSR APIだけでなく
 * Next.jsの本番ストリーミングSSRでも発火しない(`npm run dev`実ブラウザ確認で
 * 未登録名アクセス時に500クラッシュを確認し判明。components/mdx/Viz.tsxの
 * コメント参照)。そのため<Viz>本体は`next/dynamic(..., { ssr: false })`で
 * クライアント専用にし、SSR(renderToStaticMarkup含む)では常に空を描画する
 * (クラッシュしないことがここでの検証対象)。実際に登録済み名を描画すること・
 * ErrorBoundaryが未登録名を捕捉してフォールバックUIを表示することは
 * `<Viz>`が内部で使う`VizBoundary`(dynamic配下でクライアント専用に実行される
 * 実体)に対して直接検証し、「ErrorBoundaryがブラウザで実際に捕捉して表示する」
 * ことの最終確認はverify-webappスキルでの実ブラウザ確認に委ねる(完了報告に記載)。
 */
describe("resolveVizComponent", () => {
  afterEach(() => {
    for (const key of Object.keys(VIZ_REGISTRY)) {
      delete VIZ_REGISTRY[key];
    }
  });

  it("throws a descriptive error for an unregistered name", () => {
    expect(() => resolveVizComponent("DoesNotExistViz")).toThrowError(
      'Unregistered Viz component: "DoesNotExistViz"',
    );
  });

  it("returns the registered component for a known name", () => {
    function FakeViz() {
      return null;
    }
    VIZ_REGISTRY["FakeViz"] = FakeViz;
    expect(resolveVizComponent("FakeViz")).toBe(FakeViz);
  });
});

describe("Viz", () => {
  afterEach(() => {
    for (const key of Object.keys(VIZ_REGISTRY)) {
      delete VIZ_REGISTRY[key];
    }
  });

  it("renders nothing during SSR (client-only via next/dynamic ssr:false) instead of crashing on an unregistered name", () => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <Viz name="DoesNotExistDuringSSR" />
      </LessonLocaleProvider>,
    );
    expect(html).toBe("");
  });
});

describe("VizBoundary", () => {
  afterEach(() => {
    for (const key of Object.keys(VIZ_REGISTRY)) {
      delete VIZ_REGISTRY[key];
    }
  });

  it("renders the registered component when the name exists in the registry", () => {
    function FakeViz({ preset }: { preset?: string }) {
      return <div data-testid="registered-viz">{preset ?? "no-preset"}</div>;
    }
    VIZ_REGISTRY["FakeViz"] = FakeViz;

    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale="ja">
        <VizBoundary name="FakeViz" preset="scenario-a" />
      </LessonLocaleProvider>,
    );

    expect(html).toContain('data-testid="registered-viz"');
    expect(html).toContain("scenario-a");
    expect(html).not.toContain("この可視化は表示できません");
  });
});

describe("VizErrorFallback", () => {
  it.each([
    ["ja", "この可視化は表示できません", "「DoesNotExistViz」が見つかりません"],
    ["en", "This visualization can", "DoesNotExistViz&quot; was not found"],
  ] as const)("renders the fallback copy for locale=%s", (locale, title, description) => {
    const html = renderToStaticMarkup(
      <LessonLocaleProvider locale={locale}>
        <VizErrorFallback name="DoesNotExistViz" />
      </LessonLocaleProvider>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(title);
    expect(html).toContain(description);
  });
});
