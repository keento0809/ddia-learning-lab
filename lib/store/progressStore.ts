import { create } from "zustand";
import type { ProgressRecord } from "@/lib/contracts";

interface ProgressState {
  /** itemSlugをキーとした進捗レコードのキャッシュ */
  bySlug: Record<string, ProgressRecord>;
  setAll: (records: readonly ProgressRecord[]) => void;
  setOne: (record: ProgressRecord) => void;
}

/**
 * 02§4.3「ログイン時は GET /api/progress を1回取得し、Zustandにキャッシュして
 * カードへオーバーレイ」に対応する進捗キャッシュ(T-105)。
 * TanStack Query(lib/progress/useProgressQuery.ts)が取得・再検証・楽観更新を
 * 担い、このストアはその結果を各画面のオーバーレイ描画向けに反映したミラーとして
 * 使う(サーバ状態の正はTanStack Queryのキャッシュ)。
 */
export const useProgressStore = create<ProgressState>()((set) => ({
  bySlug: {},
  setAll: (records) =>
    set({ bySlug: Object.fromEntries(records.map((record) => [record.itemSlug, record])) }),
  setOne: (record) =>
    set((state) => ({ bySlug: { ...state.bySlug, [record.itemSlug]: record } })),
}));
