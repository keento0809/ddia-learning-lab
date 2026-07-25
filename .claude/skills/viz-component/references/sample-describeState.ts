/**
 * viz-componentスキルのサンプル: sample-engine.ts(ジョブキューViz)に対応する
 * describeState実装。lib/contracts/simEngine.tsのA11yNarratable<S>を満たす。
 *
 * 配置場所の例: components/viz/job-queue/describeState.ts
 *
 * 実際のプロジェクトではgetMessages(locale)/formatMessageはmessages/{ja,en}.jsonの
 * 対応キーを読む(絶対規則5: UI文言のハードコード禁止)。ここではスキル単体で
 * 読める最小サンプルとして、その呼び出し形だけを示す(実在しないnamespaceの例)。
 */
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { A11yNarratable } from "@/lib/contracts";
import type { JobQueueState } from "./sample-engine";

// 実装時は messages/{ja,en}.json に "jobQueueViz.narrator.*"(initial/enqueue/dequeue/
// dropped/noopEmpty/noopFull)のようなキーを対で追加し、getMessages(locale).jobQueueViz.narrator
// から取得する(vizCore.narrator.ariaLabelはA11yNarrator自身のaria-label用で別物。
// 各VizのdescribeStateが返すべきなのは読み上げ本文であり、混同しないこと)。
// このサンプルはメッセージファイルを新設せずに読める形にするため、実装イメージが
// 伝わる範囲で文字列を直書きしている(実コードでは絶対規則5によりこれは禁止)。
export function describeState(state: JobQueueState, locale: Locale): string {
  const t = getMessages(locale).vizCore.narrator; // 実装時は自Vizのnamespaceに置き換える
  const event = state.lastEvent;

  if (!event) {
    // 初期状態(lastEvent === null)でも必ず概況を読み上げる分岐を用意する。
    return locale === "ja"
      ? `${t.ariaLabel}: キュー ${state.items.length}件`
      : `${t.ariaLabel}: queue has ${state.items.length} item(s)`;
  }

  switch (event.kind) {
    case "enqueue":
      return formatMessage(locale === "ja" ? "ジョブ{id}を投入しました" : "job {id} enqueued", {
        id: event.id,
      });
    case "dequeue":
      return formatMessage(locale === "ja" ? "ジョブ{id}を取り出しました" : "job {id} dequeued", {
        id: event.id,
      });
    case "dropped":
      return formatMessage(
        locale === "ja" ? "満杯のためジョブ{id}を破棄しました" : "job {id} dropped (queue full)",
        { id: event.id },
      );
    case "noop":
      if (event.reason === "empty") return locale === "ja" ? "キューは空です" : "queue is empty";
      return locale === "ja" ? "キューは満杯です" : "queue is full";
    default:
      return "";
  }
}

export const jobQueueNarratable: A11yNarratable<JobQueueState> = { describeState };
