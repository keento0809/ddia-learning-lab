import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { A11yNarratable } from "@/lib/contracts";
import type { LsmTreeState } from "./types";

/**
 * 02§8.1 A11yNarrator「各Vizは describeState(state, locale) を実装必須」。
 * 直近のイベント(lastEvent)を読み上げテキストへ変換する。初期状態(lastEvent
 * がnull)では概況(Memtable件数等)を読み上げる。
 */
export function describeState(state: LsmTreeState, locale: Locale): string {
  const t = getMessages(locale).vizLsmTree.narrator;
  const event = state.lastEvent;

  if (!event) {
    return formatMessage(t.initial, { memtableCount: state.memtable.length });
  }

  switch (event.kind) {
    case "put":
      return formatMessage(t.put, { key: event.key, value: event.value });
    case "delete":
      return formatMessage(t.delete, { key: event.key });
    case "flush":
      return formatMessage(t.flush, { id: event.ssTableId, count: event.entryCount });
    case "compact":
      return formatMessage(t.compact, {
        from: event.fromLevel,
        to: event.toLevel,
        merged: event.mergedCount,
        result: event.resultCount,
        dropped: event.droppedTombstones,
      });
    case "noop":
      if (event.reason === "empty-memtable") return t.noopEmptyMemtable;
      if (event.reason === "empty-level") return formatMessage(t.noopEmptyLevel, { level: event.level ?? 0 });
      return t.noopDeepestLevel;
    default:
      return t.initial;
  }
}

export const lsmTreeNarratable: A11yNarratable<LsmTreeState> = { describeState };
