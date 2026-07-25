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
