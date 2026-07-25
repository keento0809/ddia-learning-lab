# 縮約サンプル

執筆時点(SK-01作成時)では、まだ本番カリキュラムのモジュール(T-110/T-111系)が
1本も完成していない。そのため、ここでは実リポジトリに存在し
`npm run validate:content` を実際にgreenで通過する最小構成の例として
`tests/fixtures/content/valid/{ja,en}/01-reliability/` を使う。

**注意**: この例は「ファイル構成・スキーマとして妥当な最小形」を示すための
テストフィクスチャであり、文章の分量・深さはそのまま真似ないこと。実際の
執筆では `references/style-guide.md` の分量感(1レッスン=1つの概念のまとまり、
h2見出しごとに要点が追える程度の解説)に従う。T-110-1が完成したら、その本番
モジュールを新しい縮約例としてこのファイルを差し替えることを検討する。

## ディレクトリ

```
content/ja/01-reliability/
├─ module.yaml
├─ 01-load-and-performance.mdx
├─ 02-percentiles.mdx
├─ quiz.yaml
└─ labs/
   └─ percentile-lab.yaml
content/en/01-reliability/  # 同一ファイル名構成
```

## module.yaml(ja)

```yaml
slug: 01-reliability
title: 信頼性の基礎
order: 1
minutes: 45
```

`en` 側は `title` のみ翻訳し、`slug`/`order`/`minutes` は同じ値にする。

## レッスンMDX(ja: 01-load-and-performance.mdx)

```mdx
---
title: 負荷とパフォーマンスの指標
order: 1
minutes: 15
---

# 負荷とパフォーマンスの指標

(ここに独自解説の本文。<Callout>/<Figure>/<Term>等を適宜使う)
```

`en` 側は同じ構造で、`sourceHash` をfrontmatterに追加する:

```mdx
---
title: Load and Performance Metrics
order: 1
minutes: 15
sourceHash: <JA本文から生成した値>
---

# Load and Performance Metrics
...
```

レッスン間の相対リンクは拡張子なしで書く(`[前のレッスン](./01-load-and-performance)`)。
`validate:content` がリンク切れを検査する。

## quiz.yaml

スキーマ未確定のため、現時点では最小の妥当なYAMLで置く:

```yaml
questions: []
```

## 演習YAML(labs/percentile-lab.yaml、ja)

```yaml
slug: 01-reliability/percentile-lab
language: js
entry: percentile
template: |
  // 数値配列とパーセンタイル(0-100)を受け取り、値を返す
  export function percentile(values, p) {
    // TODO: 実装
  }
tests:
  - id: t1
    name:
      ja: "p50が中央値になる"
      en: "p50 equals the median"
    call: { fn: "percentile", args: [[1, 2, 3, 4, 5], 50] }
    assert: { type: "equals", value: 3 }
timeoutMs: 3000
hints:
  - ja: "配列をソートしてからインデックスを計算します"
    en: "Sort the array first, then compute the index"
```

`en` 側は `tests` の `id`/`call`/`assert`(`name`を除く)を完全に同一の値で
コピーし、`name`/`hints`/`template` のコメントのみ英訳する
(`name`/`hints`のフィールド自体は言語非依存の `{ja, en}` オブジェクトなので、
ja/en両ファイルで同じ内容になる)。

## 検証

```bash
npm run validate:content
# → content検証: 成功(N件のslug)
```
