# 既知の落とし穴(T-204実装・qa-evaluator実機検証で発見)

いずれもT-204(LsmTreeViz)の実装中に、qa-evaluatorの敵対的QA(実際に操作して壊す)
で検出され、恒久対策としてこのスキルに集約したもの。同種のVizで同じ失敗を
繰り返さないための「なぜ」を中心に記す。

## 1. ネイティブ`disabled`はキーボード操作の連続動線を壊す

**症状**: Put→Flush→Compactのように、直前の操作で有効化されたボタンへ
Tabキーで移動し、Enterで実行…という連続操作をキーボードのみで行うと、
ある時点で操作が止まる。

**原因**: ネイティブHTML属性の`disabled`は、フォーカスが当たっている要素に
付与された瞬間、ブラウザがフォーカスを強制的に`<body>`へ落とす仕様。
「直前の操作で自分自身が無効化条件を満たすボタン」(例: put後にkey入力欄が
空になり、次のput submitボタンが無効化される)がこれに該当し、
キーボード操作者はTabをページ先頭からやり直す羽目になる。

**対策**: `disabled`属性の代わりに`aria-disabled`(タブ順序に残り、
フォーカスも奪わない)を使い、実際の無効化はイベントハンドラ側の
ガード節(`if (condition) return;`)で行う。

```tsx
function inertButtonProps(inert: boolean) {
  return {
    "aria-disabled": inert,
    className: inert ? "pointer-events-none opacity-50" : undefined,
  } as const;
}

<button
  type="button"
  {...inertButtonProps(!keyInput.trim())}
  onClick={() => {
    if (!keyInput.trim()) return; // ガード節が実質的な無効化を担う
    engine.dispatch({ type: "put", key: keyInput, value: valueInput });
  }}
>
```

テストでは「`hasAttribute("disabled")`がfalse」と「無効時にクリックしても
`engine.dispatch`相当の状態変化が起きない」の両方を検証する
(references/testing-checklist.md §4)。

## 2. framer-motionの`layoutId`付き要素はSVGではなくHTMLに置く

**症状**: `<motion.div>`や`<motion.circle>`を`AnimatePresence`配下でSVG要素として
実装すると、jsdom環境のテストで要素がDOMに残り続け、後続の操作(例: 同じkeyの
再挿入)で重複した`data-testid`要素が見つかり、テストが不安定になる。

**原因**: `AnimatePresence`の退出処理はレイアウト計測(`getBBox`等のSVG幾何API)の
完了を待つが、jsdomはこれらのAPIを実装していない。ブラウザでは問題なく動くが、
jsdom上のユニットテストでは退出アニメーションが永久に終わらない。

**対策**: アニメーション対象(`layoutId`を持つ要素)はSVGではなく、
絶対配置したHTML(`<div>`/`<span>`)で表現する。座標計算(x, y)はSVGの
`viewBox`と同じ論理座標系で行い、`position: absolute; left/top`でHTML側に
反映する(references/sample-component.tsxやLsmTreeVizの`buildMemtableTree`が実例。
純粋な静的な描画(線・軸等、layoutIdを持たない要素)はSvgStage内のSVGのままでよい)。

`layoutId`の名前空間も、同一Viz内で意味的に異なるアニメーション対象間
(例: memtableのノードとSSTable内のエントリ)では共有しないこと。
共有すると、ある状態変化(例: flush)で意図しない越境シェアードレイアウト遷移が
発生し、jsdom・ブラウザ問わず退出処理が不安定になる。

## 3. 任意長テキストを埋め込む祖先要素には`break-words`を置く

**症状**: ユーザーが長いkey/valueを入力すると、イベントログのような
自由長の文章にその値が埋め込まれる箇所で、ページが横方向にオーバーフローする。

**原因**: 個々のチップ要素(`truncate`クラス)は幅制約下での省略には効くが、
「自由長の文章の途中に埋め込まれた長いトークン」には`truncate`を個別に
当てられない(文章全体を1要素として扱っているため)。`overflow-wrap: break-word`
はCSSの継承プロパティなので、ルート要素に1度指定するだけで配下の全テキストに及ぶ。

**対策**: Vizのルート要素に`className="break-words"`を置く(Tailwindの
`break-words`は`overflow-wrap: break-word`)。個別チップの`truncate`と併用し、
「表示上の見た目はtruncateで整えつつ、万一truncateが効かない自由長テキストが
出てもページ全体は壊れない」の二段構えにする。

検証はverify-webappスキルの実ブラウザ確認で、意図的に長い文字列を入力して行う
(jsdomでは横スクロール発生を機械的に検知しづらいため)。

## 4. 言語切替でVizのローカル状態(SimEngine)が消える

**症状**(qa-evaluatorがPR#86でIsolationViz `/ja/viz-preview` にて発見):
タイムラインの並べ替え・ステップ実行の進行状況を作った状態で言語トグルを押すと、
新しいロケールのページではVizが初期状態にリセットされてしまう(02§5.1
「言語トグル押下時...状態は遷移後も復元」の要件に反する)。

**原因**: 言語トグルは同一ルートへのnext-intlの`router.push`(クライアント側遷移)
だが、レッスン本文(MDX)はロケールごとに**別々のコンパイル済みコンポーネント**
(例: `content/ja/<slug>.mdx` と `content/en/<slug>.mdx` をそれぞれコンパイルした
別関数)であるため、それを描画する箇所(`CONTENT[locale]`のようなレコード切替、
または単純な`{locale === "ja" ? <Ja/> : <En/>}`分岐)ではReactが要素typeの変化と
判断し、配下のサブツリー全体(Viz本体を含む)をアンマウント→再マウントする。
Vizが`useState(() => createSimEngine(...))`のようにコンポーネントローカルに
SimEngineを保持していると、この再マウントで状態が失われる。

**対策**: SimEngineインスタンスを、Reactツリーのライフサイクルより長生きする
モジュールスコープのキャッシュに退避し、ロケール非依存のスコープキーで
引き当てる(`lib/store/labStore.ts`が演習エディタの内容・実行結果に対して
既に使っているのと同じ発想: 「言語切替をまたぐ保持は、モジュールスコープの
シングルトンが再生成されないことで実現する」)。ページ側(Server Component、
自身のルートを静的に把握している)から`lib/lesson/vizPersistenceContext.tsx`の
`VizPersistenceScopeProvider`でスコープ文字列を渡し、Viz側は
`useVizPersistenceScope()`で読んだキーを使って「初回マウント時にキャッシュへ
存在すれば再利用、無ければ新規作成」する(`components/viz/isolation/IsolationViz.tsx`
の`getOrCreateEngine`が実例)。Provider未使用時はスコープキーが`null`になり、
常にフレッシュな状態を作る(既存の呼び出し元・単体テストとの後方互換)。

テストでは、旧ロケールでの操作後に`root.unmount()`→同一スコープの新
`root.render()`(異なるlocale)で言語切替の実態を再現し、DOM上の状態
(`data-status`等のロケール非依存な属性。表示テキストはロケールごとに翻訳
されるため比較対象にしない)が保持されることを検証する
(`tests/unit/viz/isolation/IsolationViz.test.tsx`の
「locale-switch state persistence」describeブロックが実例)。
