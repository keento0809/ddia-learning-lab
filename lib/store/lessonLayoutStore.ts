import { create } from "zustand";

export type LessonDrawer = "moduleToc" | "pageToc";

interface LessonLayoutState {
  /** モバイル(<768px)ドロワー化時に開いているパネル。デスクトップでは無視される */
  openDrawer: LessonDrawer | null;
  openDrawerPanel: (drawer: LessonDrawer) => void;
  closeDrawer: () => void;
}

/**
 * S-04 レッスン画面(T-103)の左右ペイン開閉状態。
 *
 * 失敗→恒久対策: 当初02§6「UI状態(ペイン幅/テーマ/目次開閉) → Zustand +
 * localStorage永続化」の記述に従いlib/store/themeStore.tsと同じpersist
 * middlewareを適用していたが、qa-evaluatorの実ブラウザ検証で「ドロワーを
 * 開いたままページをリロードすると次回訪問時も全画面オーバーレイが開いた
 * 状態で復元される」という驚き最小原則違反を検出した。テーマ(永続的な
 * 見た目の好み)と異なり、モバイルドロワーの開閉は一時的なオーバーレイ表示
 * 状態であり、セッションをまたいで復元すべきものではないと判断し、
 * persistを撤去した(常にopenDrawer: nullから開始する)。
 * **恒久対策**: 「UI状態はZustand+localStorage」という一般則を機械的に
 * 適用せず、対象が「永続的な設定」(テーマ等)か「一時的なオーバーレイ/
 * モーダル表示状態」かを区別すること。後者は原則persistしない。
 */
export const useLessonLayoutStore = create<LessonLayoutState>()((set) => ({
  openDrawer: null,
  openDrawerPanel: (drawer) => set({ openDrawer: drawer }),
  closeDrawer: () => set({ openDrawer: null }),
}));
