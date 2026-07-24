import type { A11yNarratable, Locale } from "@/lib/contracts";
import { PRESETS } from "./presets";
import type { IsolationState, StepEvent } from "./types";

/**
 * 02§8.1「各Vizは describeState(state, locale) を実装必須」。
 * IsolationStateの直近イベント(lastEvent)を、aria-live読み上げ用の文として
 * ja/en両方で組み立てる。文言はUIコンポーネント外(ドメイン層)で完結させる
 * ことで、A11yNarratorからはロケールを渡すだけで済むようにする。
 */

function describeEvent(event: StepEvent, locale: Locale): string {
  const txn = event.txn;
  switch (event.outcomeKind) {
    case "read": {
      if (locale === "ja") {
        return event.dirty
          ? `${txn} が ${event.key} を読み取った: ${event.value}(未コミットの値、ダーティリード)`
          : `${txn} が ${event.key} を読み取った: ${event.value}`;
      }
      return event.dirty
        ? `${txn} read ${event.key}: ${event.value} (uncommitted value — dirty read)`
        : `${txn} read ${event.key}: ${event.value}`;
    }
    case "write-applied":
      return locale === "ja"
        ? `${txn} が ${event.key} に ${event.value} を書き込んだ(未コミット)`
        : `${txn} wrote ${event.key} = ${event.value} (uncommitted)`;
    case "write-committed-lock-wait":
      return locale === "ja"
        ? `${txn} の書込みは他方のコミット待ちでブロックされている`
        : `${txn}'s write is blocked, waiting for the other transaction to commit`;
    case "commit-ok":
      return locale === "ja" ? `${txn} がコミットした` : `${txn} committed`;
    case "commit-aborted":
      return locale === "ja"
        ? `${txn} は競合のためアボートされた(変更は破棄された)`
        : `${txn} was aborted due to a conflict (its changes were discarded)`;
    default:
      return "";
  }
}

function describeBlocked(state: IsolationState, locale: Locale): string | null {
  if (!state.blockedOpId) return null;
  const operation = state.operations.find((candidate) => candidate.id === state.blockedOpId);
  if (!operation) return null;
  return locale === "ja"
    ? `${operation.txn} の次の操作はロック待ちでブロックされている`
    : `${operation.txn}'s next operation is blocked, waiting on a lock`;
}

export const isolationNarrator: A11yNarratable<IsolationState> = {
  describeState(state: IsolationState, locale: Locale): string {
    const preset = PRESETS[state.presetId];
    const presetTitle = preset.title[locale];
    const levelText = locale === "ja" ? `分離レベル: ${state.isolationLevel}` : `Isolation level: ${state.isolationLevel}`;
    const progressText =
      locale === "ja"
        ? `${state.completed.length}/${state.operations.length} 件の操作が完了`
        : `${state.completed.length}/${state.operations.length} operations completed`;

    const parts = [
      locale === "ja" ? `シナリオ: ${presetTitle}` : `Scenario: ${presetTitle}`,
      levelText,
      progressText,
    ];

    if (state.lastEvent) {
      parts.push(describeEvent(state.lastEvent, locale));
    }

    const blockedText = describeBlocked(state, locale);
    if (blockedText) {
      parts.push(blockedText);
    }

    return parts.join(locale === "ja" ? "。" : ". ");
  },
};
