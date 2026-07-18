import type { Locale } from "./common";

/**
 * 可視化コンポーネント共通基盤の状態機械インターフェース。
 * 参照設計: docs/design/02_詳細設計書.md §8.1(components/viz/core)
 *
 * 「可視化を、イベント列を発行する純粋な状態機械として実装するための基底」。
 * UIと分離することで各Viz(LsmTreeViz/HashRingViz/ReplicationLagViz/RaftViz等)を
 * 単体テスト可能にする。データ型のみのコントラクトのため zod スキーマ化はしない
 * (状態Sはジェネリックで各Vizが定義し、実行時パース対象ではないため)。
 */

/** state購読コールバックの解除関数 */
export type Unsubscribe = () => void;

/**
 * 状態S・アクションAを持つ可視化の状態機械。
 * 02 §8.1「step(), reset(), dispatch(action), subscribe」。
 */
export interface SimEngine<S, A> {
  /** 現在の状態を取得する */
  getState(): S;

  /** アクションを適用し次状態を返す(内部状態も更新する) */
  dispatch(action: A): S;

  /** 時間経過や自動再生の1ステップを進める(Timelineの再生に使用、02 §8.1 Timeline) */
  step(): S;

  /** 初期状態へ戻す */
  reset(): S;

  /** 状態変化を購読する */
  subscribe(listener: (state: S) => void): Unsubscribe;
}

/**
 * 状態を人間可読な読み上げテキストへ変換する。02 §8.1 A11yNarrator
 * 「各Vizは describeState(state, locale) を実装必須」(WCAG aria-live対応)。
 */
export interface A11yNarratable<S> {
  describeState(state: S, locale: Locale): string;
}
