---
name: viz-component
description: DDIA可視化コンポーネント(components/viz配下のViz、例HashRingViz/ReplicationLagViz/IsolationViz/LsmTreeViz)を新規実装・拡張する時に必ず使う。SimEngine(決定的乱数注入・step/reset/dispatch)の実装パターン、describeState(state, locale)によるA11y読み上げの必須実装、Timeline/SvgStage/A11yNarratorとの接続、components/viz/registry.tsへの登録、必須テスト観点を1本で示す。「新しいVizを作って」「RaftVizを実装したい」「T-20xの可視化コンポーネント」のような依頼、または既存Vizへの機能追加(新アクション追加・新プリセット追加)では、コードを書き始める前に必ずこのスキルを参照すること。
---

# viz-component: DDIA可視化コンポーネント実装スキル

このスキルは、完成済みのT-204(LsmTreeViz)・T-205(HashRingViz)・T-206(ReplicationLagViz)・
T-208(IsolationViz)から抽出した、Viz実装の反復パターンをまとめたものです。
新規Vizはこのパターンに従うことで、SimEngineの決定性・A11y・i18n・テスト観点の
均一な品質が保証されます(docs/design/08 §3.8「並列品質の均一化に直結」)。

## 1. 全体像(ファイル配置)

各Vizは `components/viz/<slug>/` 配下に以下4ファイルを持ちます
(1ファイルのみで完結する小さいVizは `components/viz/<Name>Viz.tsx` 直下 +
`components/viz/<name>Engine.ts` でも可。既存のHashRingVizがこの単純形)。

```
components/viz/<slug>/
  types.ts          # 状態S・アクションA・イベント型
  engine.ts          # SimEngineDefinition実装 + createXxxEngine()
  describeState.ts   # A11yNarratable実装
  <Name>Viz.tsx       # Reactコンポーネント本体
tests/unit/viz/<slug>/
  <Name>Viz.test.tsx        # 実DOM操作テスト
  engine.test.ts            # 純粋ロジックの単体テスト
  describeState.test.ts     # ja/en両方のナレーションテスト
  registryWiring.test.tsx   # レジストリ経由での解決・描画テスト
```

具体的な最小サンプル一式は `references/sample-engine.ts` /
`references/sample-describeState.ts` / `references/sample-component.tsx` を参照
(架空の「ジョブキュー」Vizで全パターンを実演)。

## 2. SimEngineパターン(状態機械)

契約は `lib/contracts/simEngine.ts` の `SimEngine<S, A>`
(`getState/dispatch/step/reset/subscribe`)。自分で状態機械をゼロから書かず、
必ず `components/viz/core/simEngine.ts` の `createSimEngine(definition, options)` を使う。
実装すべきは3関数のみ:

```ts
interface SimEngineDefinition<S, A> {
  createInitialState(rng: RandomSource): S;
  applyAction(state: S, action: A, rng: RandomSource): S;
  advance(state: S, rng: RandomSource): S; // step()用。自律的な時間経過がなければ恒等関数でよい
}
```

- **決定的乱数注入**: `rng: RandomSource`(`() => number`, 0以上1未満)は
  `components/viz/core/rng.ts` の `createSeededRandom(seed)`(mulberry32)から来る。
  `Math.random()` を直接使わないこと — 同一シードで同一結果になることがテスト
  (`reset`後の系列一致・別シードでの分岐)の前提になる。
- `reset()` は `createInitialState` を**再シードした**rngで呼び直す
  (`createSimEngine`が自動でやる。自前で状態を作り直さない)。
- 状態遷移の各分岐で `lastEvent`(判別可能なイベント型)を必ず更新する。
  `describeState` とアニメーション両方がここに依存するため、
  「何も起きなかった」場合も `{ kind: "noop", reason: ... }` のように明示する
  (nullのまま握りつぶさない)。

## 3. describeState(state, locale) ― 必須実装

各Vizは `lib/contracts/simEngine.ts` の `A11yNarratable<S>` を実装した
`describeState(state, locale): string` を持つ(02§8.1 A11yNarrator「各Vizは実装必須」)。
`state.lastEvent` を `switch` し、`lib/i18n/messages` の `getMessages(locale)` +
`formatMessage` でロケール別テキストへ変換する。初期状態(lastEventがnull)でも
概況を読み上げる分岐を用意する。

コンポーネント側は `components/viz/core/A11yNarrator.tsx` に
`state` / `locale` / `narratable={{ describeState }}` を渡すだけでよい
(`aria-live="polite"` + `sr-only` は共通コンポーネントが担う)。

## 4. Reactコンポーネントの接続

- **SvgStage**(`components/viz/core/SvgStage.tsx`): viewBoxを固定した論理座標系。
  リング図・ツリー図などSVGで完結する描画はここに乗せる。
- **Timeline**(`components/viz/core/Timeline.tsx`): 「自律的な時間経過」を持つVizのみ
  接続する(例: ReplicationLagVizのレプリカ転送、Raft系のタイマー)。
  `onStep={() => engine.step()}` / `onReset={() => engine.reset()}` を渡すだけ。
  LSM-TreeやHashRingのように、ユーザー操作でのみ状態が進むVizは
  Timelineを接続せず`advance`を恒等関数にする(必須ではない)。
- **A11yNarrator**: 上記の通り必須。
- テキストは必ず `messages/ja.json` / `messages/en.json` の対で追加する
  (絶対規則5)。**namespace命名は既存の登録済みVizに揃える**:
  `hashRingViz` / `replicationLagViz` / `isolationViz` のような
  `<camelCaseな名前>Viz` 形が現状の多数派(共通UI文言は `vizCore`)。
  新規追加前に `messages/ja.json` の既存キーを1つ確認してから合わせること
  (未マージタスク間で命名が揺れることがあるため、思い込みで決め打ちしない)。

## 5. レジストリ登録とMDX埋め込み

`components/viz/registry.ts` の `VIZ_REGISTRY` にコンポーネントを追加する。
MDXコンテンツからは `<Viz name="<slug>">` で遅延ロードされる
(`components/mdx/Viz.tsx` が `next/dynamic(ssr:false)` でラップ)。
未登録名は `resolveVizComponent` がthrowし `VizErrorBoundary` がフォールバック表示する。
登録後は `registryWiring.test.tsx` で「レジストリから解決できる」
「`<VizBoundary name="...">` 経由で実体が描画される」の2点を検証する
(`tests/unit/viz/isolation/registryWiring.test.tsx` が実例)。

## 6. 必須テスト観点

詳細なチェックリストと実例ファイルへのポインタは
`references/testing-checklist.md` を参照。要点のみ:

1. **engine.test.ts**: React抜きの純粋ロジック(状態遷移の分岐網羅)を検証する。
2. **決定性**: 同一シードで`dispatch`/`step`列を再現すると同一状態になること、
   別シードでは分岐すること(`tests/unit/viz/simEngine.test.ts`が基底の実例)。
3. **describeState.test.ts**: ja/enそれぞれ非空・別文言であること、主要イベント
   (このVizの受入基準に挙がっている遷移)を最低1つずつ検証する。
4. **<Name>Viz.test.tsx**: `react-dom/client` + `act`によるDOM操作テスト
   (Testing Libraryではなくこのリポジトリの既存流儀に合わせる)。ネイティブの
   `<button>`/`<input>`のクリック・入力のみで状態遷移が起きることを検証する
   (キーボード操作可能性の裏付け)。
5. **registryWiring.test.tsx**: 上記の通り。

## 7. 検証ループ(完了報告前に必須)

1. `npm run lint && npm run typecheck && npm run test` を実行し出力を表示する。
2. UI変更なので **verify-webappスキル**の手順で実ブラウザ確認する
   (dev server起動 → /ja /en 両方で操作 → 言語切替で状態保持 → console確認)。
3. **qa-evaluator**の採点を完了報告前に必ず受ける(全観点4以上がハード閾値)。

## 8. 既知の落とし穴(T-204実装・qa-evaluator実機検証で発見)

詳細と理由は `references/pitfalls.md` を参照。見出しのみ:

- **ネイティブ`disabled`は使わない**: フォーカス中のボタンに付与された瞬間
  フォーカスが`<body>`へ落ち、キーボード操作の連続動線が壊れる。
  `aria-disabled` + ハンドラ側ガード節で代替する。
- **framer-motionのlayoutId付き要素はSVGではなくHTML(div)に置く**:
  jsdomがSVGの`getBBox`等の幾何APIを実装しておらず、
  `AnimatePresence`の退出処理が完了しない。
- **任意長テキスト(key/value等)を埋め込む祖先要素には`break-words`を置く**:
  子要素個別の`truncate`だけでは、自由長の文章(イベントログ等)に埋め込まれた
  長い文字列がページを横オーバーフローさせる。

## 9. references/ 一覧

- `references/sample-engine.ts` — SimEngineDefinition実装サンプル(ジョブキューVizの`engine.ts`)
- `references/sample-describeState.ts` — describeState実装サンプル
- `references/sample-component.tsx` — SvgStage/Timeline/A11yNarrator接続サンプル
- `references/testing-checklist.md` — 必須テスト観点の詳細版と実例ファイルへのポインタ
- `references/pitfalls.md` — 既知の落とし穴の詳細(理由・再現条件・対策コード)
