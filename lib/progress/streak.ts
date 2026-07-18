/**
 * 学習ストリーク計算。02§2.1 streaks / §3.1 PUT /api/progress「clientTz: ストリーク計算用」。
 * ユーザーのIANAタイムゾーンでの「今日」の日付文字列(YYYY-MM-DD)を基準に、
 * 前回アクティブ日との日数差で連続日数を更新する純粋関数群(DB非依存でテスト可能)。
 */

export interface StreakState {
  currentDays: number;
  longestDays: number;
  /** YYYY-MM-DD (ユーザーTZ基準)。未記録なら null */
  lastActiveDate: string | null;
}

const MS_PER_DAY = 86_400_000;

/** clientTzが有効なIANAタイムゾーン識別子かどうか */
export function isValidTimeZone(clientTz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: clientTz });
    return true;
  } catch {
    return false;
  }
}

/** clientTzにおける`now`の日付をYYYY-MM-DD形式で返す */
export function todayInTimeZone(clientTz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: clientTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * ストリーク状態を「今日」の活動を反映して進める。
 * 同日内の複数回呼び出しは冪等(加算しない)。前回アクティブ日の翌日なら+1、
 * それ以外(空白/巻き戻り)は1にリセットする。
 */
export function advanceStreak(state: StreakState, today: string): StreakState {
  if (state.lastActiveDate === today) {
    return state;
  }
  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;
  const currentDays = gap === 1 ? state.currentDays + 1 : 1;
  return {
    currentDays,
    longestDays: Math.max(state.longestDays, currentDays),
    lastActiveDate: today,
  };
}
