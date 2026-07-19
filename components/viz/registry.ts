import type { ComponentType } from "react";

export interface VizComponentProps {
  preset?: string;
}

/**
 * 可視化コンポーネントレジストリ(T-103, 02§4.1「Vizは遅延ロード枠のみ」)。
 * 個別可視化(LsmTreeViz/HashRingViz等、T-204以降)はこのレジストリへ追加登録する。
 * T-103時点では未着手のため空。<Viz name>で未登録のnameを指定した場合は
 * components/mdx/Viz.tsxがErrorをthrowし、VizErrorBoundaryがフォールバック
 * 表示する(受入基準)。
 */
export const VIZ_REGISTRY: Record<string, ComponentType<VizComponentProps>> = {};

/**
 * レジストリ参照ロジックを純粋関数として切り出す(<Viz>本体から分離)。
 * componentDidCatch/getDerivedStateFromError(クラスコンポーネントのcommitフェーズ
 * ライフサイクル)はreact-dom/serverの同期SSR API(renderToStaticMarkup等)では
 * 呼び出されない(ブラウザでの実レンダリング時のみ発火する)ため、「未登録名で
 * throwする」というロジック自体はReactレンダリングを介さない純粋関数として
 * ここで検証できるようにする。実際にVizErrorBoundaryが捕捉して表示することの
 * 確認はverify-webappスキルでの実ブラウザ確認に委ねる。
 */
export function resolveVizComponent(name: string): ComponentType<VizComponentProps> {
  const component = VIZ_REGISTRY[name];
  if (!component) {
    throw new Error(`Unregistered Viz component: "${name}"`);
  }
  return component;
}
