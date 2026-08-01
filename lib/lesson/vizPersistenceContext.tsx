"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Vizの内部状態(SimEngineインスタンス)を、同一ルート内での言語切替をまたいで
 * 保持するためのスコープキー伝搬(02§5.1「言語トグル押下時...演習エディタの内容・
 * 実行結果・スクロール位置はZustandに保持しているため遷移後も復元」と同じ要件を、
 * Viz側の状態機械にも適用する)。
 *
 * 言語トグルは同一ルートへのnext-intlのrouter.push(クライアント側遷移)だが、
 * ルート([locale]セグメント)配下でロケールごとに別々のコンパイル済みMDX
 * コンポーネントを描画する構成(例: app/[locale]/viz-preview/page.tsx の
 * CONTENT[locale])のため、Reactは要素typeの変化としてサブツリーを
 * アンマウント→再マウントする。そのため、Vizコンポーネント内のuseState等の
 * ローカル状態は言語切替のたびに失われる。
 *
 * page.tsx(Server Component)は自身のルートを静的に把握しているため、動的な
 * pathname取得(next-intlのusePathname、App Routerコンテキストが必要でテスト環境
 * では使えない)は不要で、呼び出し側が明示的に渡す固定文字列をスコープキーとする。
 * 未提供(既定値null)の場合、Vizは永続化を行わずマウントの都度フレッシュな状態を
 * 作る(このProviderを使わない既存の描画経路・単体テストと完全に後方互換)。
 */
const VizPersistenceScopeContext = createContext<string | null>(null);

export function VizPersistenceScopeProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  return <VizPersistenceScopeContext.Provider value={scope}>{children}</VizPersistenceScopeContext.Provider>;
}

export function useVizPersistenceScope(): string | null {
  return useContext(VizPersistenceScopeContext);
}
