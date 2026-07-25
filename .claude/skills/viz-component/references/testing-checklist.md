# 必須テスト観点(詳細版)

Vizのテストは4ファイルに分ける(SKILL.md §1のファイル配置)。それぞれの狙いと
実例ファイルを示す。新規Vizのテストを書く前に、対応する実例を1つ開いて
構造を確認すること(このリストだけでなく、実際のコードを見て流儀を合わせる)。

## 1. engine.test.ts ― 純粋ロジックの単体テスト

React・DOM抜きで、状態遷移の分岐を網羅する。「このアクションをこの状態に適用したら
どうなるか」だけを問う。

- 各アクション種別ごとに最低1テスト(正常系)
- 受入基準に挙がっている「境界条件」(容量超過・空状態でのdequeue・最深レベルでの
  コンパクション等)は必ずnoop/エラー分岐として個別にテストする
- 実例: `tests/unit/viz/isolation/engine.test.ts`、T-204の
  `mergeEntriesByLatestSeq`/`dropTombstones`のような「複雑なロジックを純粋関数に
  切り出してテストする」パターン(`.claude/worktrees/T-204-lsm-viz/components/viz/lsm-tree/engine.ts`、
  マージ後は`components/viz/lsm-tree/engine.ts`)

## 2. 決定性(SimEngine共通の性質)

- 同一シードで同じ`dispatch`/`step`列を2回実行すると同一状態になること
- 別シードでは(rngを消費する分岐で)結果が分岐すること
- `reset()`後は「同一シードで最初から実行した場合」と同じ状態遷移になること
  (`createSimEngine`が自動で再シードするため、Viz側の実装ミスではなく
  「rngを経路の外で保持していないか」の確認になる)
- 基底の実例: `tests/unit/viz/simEngine.test.ts`(counterDefinitionでの検証)。
  自分のVizでも同じ形の決定性テストをengine.test.ts内に含める

## 3. describeState.test.ts ― A11yナレーション

- 初期状態でja/enそれぞれ非空、かつ互いに異なる文言であること
- このVizの受入基準に挙がっている主要イベント(例: 「ダーティリードが起きたら
  読み上げに反映される」)を、実際に状態を遷移させてから検証する
  (初期状態のテキストだけで済ませない)
- 実例: `tests/unit/viz/isolation/describeState.test.ts`

## 4. <Name>Viz.test.tsx ― 実DOM操作テスト

このリポジトリはReact Testing Libraryではなく `react-dom/client` + `act` +
`data-testid`クエリで実DOMを操作する流儀(既存4Viz全てで統一)。新規Vizもこれに合わせる。

- `IS_REACT_ACT_ENVIRONMENT = true` の設定と `mountContainer()` ヘルパーは
  既存テストからそのままコピーしてよい(プロジェクト共通の定型)
- **フォーム入力**は`Object.getOwnPropertyDescriptor`経由のnative setterで値を設定し、
  `input`イベントをdispatchする(Reactの制御コンポーネントに認識させるため。
  `.claude/worktrees/T-204-lsm-viz/tests/unit/viz/lsm-tree/LsmTreeViz.test.tsx`の
  `setInputValue`ヘルパーが実例)
- 操作は必ず`<button>`/`<input>`等のネイティブ要素への`click()`/`input`イベント経由で行う
  (キーボード操作可能性の裏付けになる。クリックハンドラを直接呼ばない)
- **aria-disabledの検証**: `hasAttribute("disabled")`がfalseであること
  (pitfalls.md参照)と、無効時に実際にクリックしても状態が変わらない
  (ガード節がdispatch自体を止めている)ことの両方を検証する
- 実例: `tests/unit/viz/HashRingViz.test.tsx`、
  T-204マージ後は`tests/unit/viz/lsm-tree/LsmTreeViz.test.tsx`
  (未マージの間は`.claude/worktrees/T-204-lsm-viz/tests/unit/viz/lsm-tree/LsmTreeViz.test.tsx`)

## 5. registryWiring.test.tsx ― レジストリ配線

- `VIZ_REGISTRY["<slug>"]`が期待するコンポーネントであること
- `<VizBoundary name="<slug>" preset="...">`を実際にマウントし、
  そのVizのルート要素(`data-testid`)が描画されることを検証する
- 実例: `tests/unit/viz/isolation/registryWiring.test.tsx`

## 6. 忘れがちな観点

- **言語切替時の状態保持**: これは単体テストではなくverify-webappスキルの
  実ブラウザ検証(docs/design/02 §5.1)で確認する。単体テストで無理に模倣しない
- **横オーバーフロー**: 任意長の文字列(ユーザー入力のkey等)を含むVizは、
  意図的に長い文字列を入力してレイアウトが壊れないことをverify-webappの
  実ブラウザ確認で見る(jsdomでは横スクロール発生を機械的に検知しづらい)
