import { create } from "zustand";
import type { ScenarioDecisionId, ScenarioSelection } from "@/lib/scenario/schema";

/**
 * キャップストーン画面(T-302)の選択状態。02§6「クライアント状態=Zustand」、
 * 01基本設計書 F-08「言語切替(1クリック、状態保持)」に対応する。
 *
 * lib/store/labStore.tsと同じ理由で、選択状態(useState相当)をコンポーネント外の
 * モジュールスコープシングルトンに置く。next-intlの言語トグル
 * (components/LocaleToggle.tsx)は同一ルートへのクライアント側`router.push`で
 * あり、これによりルート内のClient Componentは再マウントされて`useState`は
 * 失われるが、モジュールスコープの本ストアは再生成されずに保持されるため、
 * 言語切替をまたいで選択内容・送信状態が復元される。
 */
interface CapstoneStoreState {
  selection: ScenarioSelection;
  submitted: boolean;
  select: (decisionId: ScenarioDecisionId, optionId: string) => void;
  submit: () => void;
  reset: () => void;
}

export const useCapstoneStore = create<CapstoneStoreState>()((set) => ({
  selection: {},
  submitted: false,

  select: (decisionId, optionId) =>
    set((state) => ({
      selection: { ...state.selection, [decisionId]: optionId },
      submitted: false,
    })),

  submit: () => set({ submitted: true }),

  reset: () => set({ selection: {}, submitted: false }),
}));
