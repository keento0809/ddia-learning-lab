import { create } from "zustand";
import type { RunRequest, RunResult } from "@/lib/contracts/runner";
import type { LabStatus } from "@/lib/lab/labStateMachine";

export type { LabStatus };

/**
 * S-06 演習ページ(T-108)の演習別実行状態。02§6「エディタ内容・実行結果 →
 * Zustand(labStore: slug単位のMap)+ localStorage永続化」に対応する。
 *
 * このストア自体はメモリ上の状態のみを扱う同期的なコンテナとする(Worker起動等の
 * 非同期オーケストレーションはコンポーネント側`components/lab/LabWorkspace.tsx`が
 * 担う)。理由: jsdomが未導入のためVitestではDOM/実Workerを介した検証ができず
 * (vitest.config.tsに`environment: "jsdom"`なし、既存パターンも
 * `renderToStaticMarkup`によるSSR文字列検証のみ)、ストア自体は同期セッタのみに
 * 保つことで純粋なユニットテスト(store.getState()/setState()を直接呼ぶだけ)で
 * 検証可能にする。非同期の実行フロー自体はverify-webapp/Playwrightで検証する。
 *
 * 言語切替をまたぐ保持(02§5.1「演習エディタの内容・実行結果はZustandに保持して
 * いるため遷移後も復元」)は、キーを exerciseSlug のみ(言語非依存)にすることで
 * 実現する。next-intlの言語トグルは同一ルートへの`router.push`(クライアント側
 * 遷移)のため、このストア(モジュールスコープのシングルトン)自体は再生成されず
 * 保持される。ドラフトのlocalStorage自動保存(`lib/lab/draftStorage.ts`)は
 * 言語ごとに別キー(`draft:{slug}:{lang}`)で行うため、このストアの初期コード
 * (`ensureEntry`の`initialCode`)は呼び出し側(コンポーネント)が「メモリ上に
 * 既存エントリがあればそれを、無ければその言語のドラフト→無ければtemplate」の
 * 優先順で決定する。
 */

export type LabLeftTab = "problem" | "hints" | "explanation";
export type LabResultTab = "tests" | "console";

export interface LabEntryState {
  code: string;
  status: LabStatus;
  result: RunResult | null;
  /** 直近の実行に使ったRunRequest.tests(期待値を保持。結果パネルのdiff表示に使う) */
  requestTests: RunRequest["tests"];
  failCount: number;
  activeLeftTab: LabLeftTab;
  activeResultTab: LabResultTab;
  explanationRevealed: boolean;
}

function createInitialEntry(code: string): LabEntryState {
  return {
    code,
    status: "idle",
    result: null,
    requestTests: [],
    failCount: 0,
    activeLeftTab: "problem",
    activeResultTab: "tests",
    explanationRevealed: false,
  };
}

export const MIN_PANE_WIDTH_PERCENT = 20;
export const MAX_PANE_WIDTH_PERCENT = 80;
/** 02§4.2 ASCII図「左 38%(可変)」の初期値 */
export const DEFAULT_PANE_WIDTH_PERCENT = 38;

export function clampPaneWidthPercent(percent: number): number {
  return Math.min(MAX_PANE_WIDTH_PERCENT, Math.max(MIN_PANE_WIDTH_PERCENT, percent));
}

interface LabStoreState {
  entries: Record<string, LabEntryState>;
  paneWidthPercent: number;

  ensureEntry: (slug: string, initialCode: string) => void;
  setCode: (slug: string, code: string) => void;
  setStatus: (slug: string, status: LabStatus) => void;
  setResult: (slug: string, result: RunResult, requestTests: RunRequest["tests"]) => void;
  incrementFailCount: (slug: string) => void;
  setActiveLeftTab: (slug: string, tab: LabLeftTab) => void;
  setActiveResultTab: (slug: string, tab: LabResultTab) => void;
  revealExplanation: (slug: string) => void;
  resetCode: (slug: string, templateCode: string) => void;
  setPaneWidthPercent: (percent: number) => void;
}

export const useLabStore = create<LabStoreState>()((set, get) => ({
  entries: {},
  paneWidthPercent: DEFAULT_PANE_WIDTH_PERCENT,

  ensureEntry: (slug, initialCode) => {
    if (get().entries[slug]) return;
    set((state) => ({
      entries: { ...state.entries, [slug]: createInitialEntry(initialCode) },
    }));
  },

  // 編集は「どの状態からも editing(idle) に戻れる。結果は保持」(02§4.2)。
  setCode: (slug, code) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, code, status: "idle" } } };
    }),

  setStatus: (slug, status) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, status } } };
    }),

  setResult: (slug, result, requestTests) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, result, requestTests } } };
    }),

  incrementFailCount: (slug) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return {
        entries: { ...state.entries, [slug]: { ...entry, failCount: entry.failCount + 1 } },
      };
    }),

  setActiveLeftTab: (slug, tab) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, activeLeftTab: tab } } };
    }),

  setActiveResultTab: (slug, tab) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, activeResultTab: tab } } };
    }),

  revealExplanation: (slug) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return { entries: { ...state.entries, [slug]: { ...entry, explanationRevealed: true } } };
    }),

  resetCode: (slug, templateCode) =>
    set((state) => {
      const entry = state.entries[slug];
      if (!entry) return state;
      return {
        entries: {
          ...state.entries,
          [slug]: {
            ...entry,
            code: templateCode,
            status: "idle",
            result: null,
            requestTests: [],
          },
        },
      };
    }),

  setPaneWidthPercent: (percent) => set({ paneWidthPercent: clampPaneWidthPercent(percent) }),
}));
