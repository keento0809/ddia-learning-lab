"use client";

import dynamic from "next/dynamic";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { resolveVizComponent } from "@/components/viz/registry";
import { VizErrorBoundary } from "@/components/viz/VizErrorBoundary";

/**
 * MDXカスタムコンポーネント<Viz>(T-103, 02§4.1)。可視化コンポーネントの
 * 遅延ロード埋め込み。T-103時点ではレジストリが空(個別可視化はT-204以降)のため、
 * 実質的には「未登録名でErrorBoundaryにフォールバックする」経路のみが動作する。
 *
 * 失敗→恒久対策: 当初SSR(Server Component経由でレンダリングされるMDX本文の一部)
 * として`<VizErrorBoundary><VizInner/></VizErrorBoundary>`を直接描画していたが、
 * `npm run dev`実ブラウザ確認で「未登録名を指定すると500(サーバ全体がクラッシュ
 * し、フォールバックUIが出ない)」ことを発見した。原因はReactのクラスベース
 * Error Boundary(componentDidCatch/getDerivedStateFromError)がサーバレンダリング
 * (legacy renderToStaticMarkupだけでなく、Next.jsの本番ストリーミングSSR/Fizzでも
 * 同様)では発火せず、クライアント側の実際のマウント時にしか機能しないという
 * Reactの仕様上の制約によるもの(`renderToStaticMarkup`でのVitestテストでも
 * 同じ制約を確認済み、tests/unit/mdx/Viz.test.tsx参照)。
 * 対策として`next/dynamic(..., { ssr: false })`でVizサブツリー全体をクライアント
 * 専用レンダリングにし、登録チェック・エラー捕捉がブラウザでの実マウント時に
 * のみ実行されるようにした(02§4.1が明示する「遅延ロード」という設計語彙とも
 * 整合する)。**恒久対策**: 今後クライアント側の状態(初回レンダリング時に失敗
 * しうる外部データ・未確定なレジストリ参照等)に依存してthrowする可能性のある
 * コンポーネントをError Boundaryで保護する場合、そのサブツリーは
 * `next/dynamic(..., { ssr: false })`でクライアント専用にすること。
 * SSRされるサブツリーでのthrowはError Boundaryで捕捉されず、リクエスト全体を
 * 500にする。
 */
export function VizErrorFallback({ name }: { name: string }) {
  const locale = useLessonLocale();
  const t = getMessages(locale).lesson.viz;
  return (
    <div
      role="alert"
      data-testid="viz-error-fallback"
      className="my-4 rounded border border-dashed border-neutral-300 p-4 text-sm dark:border-neutral-700"
    >
      <p className="font-semibold">{t.fallbackTitle}</p>
      <p className="text-neutral-600 dark:text-neutral-400">
        {formatMessage(t.fallbackDescription, { name })}
      </p>
    </div>
  );
}

function VizInner({ name, preset }: { name: string; preset?: string }) {
  const VizComponent = resolveVizComponent(name);
  return <VizComponent preset={preset} />;
}

export function VizBoundary({ name, preset }: { name: string; preset?: string }) {
  return (
    <VizErrorBoundary fallback={<VizErrorFallback name={name} />}>
      <VizInner name={name} preset={preset} />
    </VizErrorBoundary>
  );
}

const VizClientOnly = dynamic(() => Promise.resolve(VizBoundary), { ssr: false });

export function Viz({ name, preset }: { name: string; preset?: string }) {
  return <VizClientOnly name={name} preset={preset} />;
}
