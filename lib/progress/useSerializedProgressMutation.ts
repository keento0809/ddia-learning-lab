"use client";

import { useCallback, useRef } from "react";
import type { PutProgressResponse } from "@/lib/contracts";
import { useMarkProgressMutation, type MarkProgressInput } from "./useMarkProgressMutation";

/**
 * 同一itemSlugへ「クリックしたdone」と「スクロール検知したin_progress」の
 * ようなトリガが同期的に(同一JSタスク内で)重なった場合に、後発の呼び出しを
 * 即座に無視する(先発の応答を待たせない)ための直列化ラッパ(T-105)。
 *
 * 失敗→恒久対策: 当初はCompleteAndNextButtonとLessonLayoutが別々の
 * useMarkProgressMutation()インスタンスを持ち、スクロール80%検知のin_progress
 * 保存とボタンのdone保存が互いを待たずに同時にPUTを送れてしまっていた。
 * サーバ(app/api/progress/route.ts、T-104、本タスクのスコープ外)の単調性
 * チェックは「処理開始時点の既存レコードを読む→書く」の非トランザクション
 * 処理のため、後着リクエストが先着の結果を読めていないと後退(done→in_progress)
 * を防げないレースがある(実ブラウザ確認で検出)。
 * mutationインスタンスの共有(disabled連動)だけでは、Reactの再レンダーが
 * 反映されるより前の同一タスク内の多重発火(例: 素早い連打、スクロール検知と
 * クリックがほぼ同時)までは防げない。`inFlightRef`による同期チェックは
 * mutateAsync呼び出し前に即座に評価されるため、Reactの再レンダーを待たずに
 * 後発呼び出しをブロックできる。
 */
export class ProgressMutationInFlightError extends Error {
  constructor() {
    super("A progress mutation for this item is already in flight");
    this.name = "ProgressMutationInFlightError";
  }
}

export function useSerializedProgressMutation() {
  const mutation = useMarkProgressMutation();
  const inFlightRef = useRef(false);

  const dispatch = useCallback(
    async (input: MarkProgressInput): Promise<PutProgressResponse> => {
      if (inFlightRef.current) {
        throw new ProgressMutationInFlightError();
      }
      inFlightRef.current = true;
      try {
        return await mutation.mutateAsync(input);
      } finally {
        inFlightRef.current = false;
      }
    },
    [mutation],
  );

  return { mutation, dispatch };
}
