/**
 * スクロール80%検知(T-103受入基準、02§4.1「スクロール80%到達で自動的にin_progress
 * 記録(ログイン時のみ)」)。
 *
 * 設計判断(Out of Scope、CLAUDE.md規則10): 進捗API接続(実際にin_progressを
 * 記録する処理)はT-105(進捗クライアント統合)のスコープのため、本タスクでは
 * 「閾値到達を検知してコールバックを1回だけ呼ぶ」検知ロジックのみを実装する。
 * 呼び出し側(page.tsx)は現時点ではコールバックを渡さない(または将来T-105が
 * ここへ実際のmutationを注入する)。
 *
 * 純粋関数として切り出すことで、DOM(jsdom等の追加依存)なしでVitestから
 * 決定的に検証できるようにしている。
 */
export interface ScrollProgressInput {
  /** window.scrollY相当 */
  scrollY: number;
  /** window.innerHeight相当 */
  viewportHeight: number;
  /** 記事コンテナの文書先頭からの絶対Y座標(getBoundingClientRect().top + scrollY) */
  articleTop: number;
  /** 記事コンテナの総高さ(scrollHeight) */
  articleHeight: number;
}

/** 記事の読了進捗(0〜1)を計算する */
export function computeScrollProgress({
  scrollY,
  viewportHeight,
  articleTop,
  articleHeight,
}: ScrollProgressInput): number {
  if (articleHeight <= 0) return 1;
  const scrolledPastArticleTop = scrollY + viewportHeight - articleTop;
  return Math.min(1, Math.max(0, scrolledPastArticleTop / articleHeight));
}

export function hasReachedThreshold(progress: number, threshold: number): boolean {
  return progress >= threshold;
}
