"use client";

import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import type { MarkProgressInput } from "@/lib/progress/useMarkProgressMutation";
import { ProgressMutationInFlightError } from "@/lib/progress/useSerializedProgressMutation";
import type { PutProgressResponse } from "@/lib/contracts";

/**
 * 02§4.1「『完了して次へ』押下で PUT /api/progress {status:"done"} を楽観更新
 * (TanStack Query mutation、失敗時ロールバック)」(T-105)。
 *
 * `mutation`(UI状態表示用)と`dispatch`(実際の送信、同期的な多重発火ガード付き)
 * は呼び出し側(LessonLayout)の`useSerializedProgressMutation()`から受け取る
 * (詳細・恒久対策の経緯はlib/progress/useSerializedProgressMutation.ts参照)。
 * `dispatch`が`ProgressMutationInFlightError`を投げた場合(スクロール検知の
 * in_progress保存等、同一itemSlugへの別トリガが同期的に競合した場合)は、
 * ユーザーには何も見せず静かに無視する(先発の処理が直後に完了しボタンは
 * 通常どおり再度クリック可能になるため、エラー表示は誤解を招く)。
 *
 * ナビゲーション自体は`onCompleted`経由で呼び出し側(LessonLayout)に委ねる
 * (next-intlのuseRouterはNext.jsのApp Routerコンテキストに依存しテストで
 * モックしづらいため、mutation成功後の遷移先決定はこのコンポーネントの
 * 責務外とし、msw+mutation単体の成功/失敗/ロールバックを直接検証できるようにする)。
 * 失敗時はページ遷移せず、ボタン下にインラインの通知(role="alert")を表示する
 * (トースト同等のフィードバックを、専用の全画面通知基盤を新設せずに実現する)。
 *
 * 未ログイン(`isAuthenticated`false)の場合はPUT /api/progressが401になる
 * ため呼び出さず、`onGuestComplete`(呼び出し側がlib/progress/guestProgress.tsの
 * recordGuestProgressを呼ぶ)のみ実行してそのまま`onCompleted`へ進む
 * (T-113、F-17「ゲスト: 進捗はlocalStorage」)。
 */
export function CompleteAndNextButton({
  locale,
  itemSlug,
  mutation,
  dispatch,
  isAuthenticated,
  onGuestComplete,
  onCompleted,
}: {
  locale: Locale;
  itemSlug: string;
  mutation: UseMutationResult<PutProgressResponse, Error, MarkProgressInput>;
  dispatch: (input: MarkProgressInput) => Promise<PutProgressResponse>;
  isAuthenticated: boolean;
  onGuestComplete: () => void;
  onCompleted: () => void;
}) {
  const t = getMessages(locale).lesson;
  const [showError, setShowError] = useState(false);

  async function handleClick() {
    setShowError(false);
    if (!isAuthenticated) {
      onGuestComplete();
      onCompleted();
      return;
    }
    try {
      await dispatch({ itemType: "lesson", itemSlug, status: "done" });
      onCompleted();
    } catch (err) {
      if (err instanceof ProgressMutationInFlightError) {
        return;
      }
      setShowError(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={mutation.isPending}
        data-testid="lesson-complete-next"
        className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {mutation.isPending ? t.completingLabel : t.completeNextLabel}
      </button>
      {showError ? (
        <p
          role="alert"
          data-testid="lesson-complete-next-error"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {t.completeErrorLabel}
        </p>
      ) : null}
    </div>
  );
}
