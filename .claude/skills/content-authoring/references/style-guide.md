# スタイルガイド

content-authoringスキル本体(SKILL.md)から参照される詳細資料。執筆前に一読し、
迷ったときに読み返す。

## 1. 想定読者とトーン

`docs/design/01_基本設計書.md` §1.4 が定義する4ペルソナを常に意識する:

- P1 中堅バックエンドエンジニア(実務3〜7年): 「なぜそうなるか」の内部構造を
  知りたい。前提知識(HTTP、DB基本操作)を再説明しない。
- P2 学生・ジュニアエンジニア: 実務経験が浅い。専門用語の初出時は
  一言で言い換える(用語集への `<Term>` リンクと併用)。
- P3 SRE/インフラエンジニア: 障害モード・整合性モデルの深掘りを期待する。
  「起きうる問題」を具体例で書く。
- P4 英語学習を兼ねたい学習者: JA/EN対訳の技術英語を学ぶ。EN側は直訳ではなく
  自然な技術英語で書く(用語はglossary.yamlで対応を保ちつつ、文全体の
  逐語訳はしない)。

トーンは「実務者が同僚に説明する」口調。断定的すぎる言い切りより、
「〜になりやすい」「〜という設計判断がある」のようにトレードオフを示す
書き方を優先する(原著の主題である「唯一の正解はない」姿勢に合わせる)。

## 2. レッスンの構成

1モジュールは以下の構造(`docs/design/01_基本設計書.md` §3「レッスン内部構造」):

```
モジュール
 ├─ レッスン 3〜5本(解説テキスト + 図解/可視化)
 ├─ クイズ(選択式、即時フィードバック。§4 参照)
 ├─ ハンズオン演習 1〜2本(コードエディタ + 自動採点)
 └─ まとめ & 原著参照(<BookRef>)
```

1レッスンの目安は「1つの概念のまとまり」。frontmatterの `minutes` と
実際の読了時間の乖離が大きくならないよう、長くなりすぎる場合はレッスンを
分割する(`module.yaml` の `minutes` はレッスン `minutes` の合計に近い値にする)。

見出し構成の目安:
- `# ` (h1) はfrontmatterの `title` と一致させる(レッスン1本につき1つ)。
- `## ` (h2) で概念のまとまりを区切る。ページ内目次(右カラム)はh2/h3を
  拾って自動生成されるため、見出しだけを読んでも要点が追えるようにする。

## 3. MDXカスタムコンポーネントの詳細(`docs/design/02_詳細設計書.md` §4.1)

| コンポーネント | props | 実装 | 使い分けの指針 |
|---|---|---|---|
| `<Callout type="info\|warn\|tip">` | `type`(既定info) | `components/mdx/Callout.tsx` | info=補足知識、warn=誤解しやすい落とし穴、tip=実務Tips。多用しない(1レッスンに2〜3個程度) |
| `<Figure src alt captionKey?>` | `src`(画像パス), `alt`(代替テキスト、必須), `captionKey?`(`messages/{ja,en}.json` の `lesson.figureCaptions` キー) | `components/mdx/Figure.tsx` | 図を使う場合は必ず `alt` を意味のある文で書く。キャプションを出したい場合は `figureCaptions` にキーを追加してから参照する(UI文言ハードコード禁止、CLAUDE.md規則5) |
| `<Term slug>` | `slug`(`content/glossary.yaml` のエントリslug) | `components/mdx/Term.tsx` | 用語の初出箇所で使う。同じ用語を1レッスン内で何度も `<Term>` で囲む必要はない(初出の1箇所で十分) |
| `<Viz name preset?>` | `name`(`components/viz/registry.ts` 登録名), `preset?` | `components/mdx/Viz.tsx` | 対応するVizコンポーネントが未実装の章では使わない(未登録名はエラーフォールバック表示になる。存在確認してから使用する) |
| `<CodeBlock lang runnable?>` | `lang`, `runnable?`(既定false) | `components/mdx/CodeBlock.tsx` | 読み取り専用のコード例。`runnable`はUI表示のみで実行結果には未接続(SKILL.md §6)。演習の実行・採点は`labs/*.yaml`側で完結させる |
| `<QuizInline id prompt options correctOptionId explanation?>` | `id`, `prompt`, `options: {id,label}[]`, `correctOptionId`, `explanation?` | `components/mdx/QuizInline.tsx` | 本文中で理解度を即座に確認したい箇所に置く。`quiz.yaml`(モジュール末尾のまとめクイズ)とは別物で、進捗APIには送信されない |
| `<BookRef chapter={n}>` | `chapter`(原著の章番号) | `components/mdx/BookRef.tsx` | レッスンまたはモジュール末尾に1つ。書誌情報のみを表示し、本文の要約・引用は書かない |

## 4. 用語集(glossary.yaml)運用

`content/glossary.yaml` はエントリの配列:

```yaml
- slug: latency
  term:
    ja: レイテンシ
    en: latency
  definition:
    ja: リクエストからレスポンスまでの所要時間。
    en: The time elapsed between a request and its response.
  chapter: 1
```

- 新出用語は本文で `<Term slug="latency">レイテンシ</Term>` のように使う前に、
  必ずこのYAMLへ `ja`/`en` 両方のエントリを追加する([[i18n.md]])。
- `definition` は独自解説(原著の定義文の翻訳ではない)。
- 既存slugと意味が重複する用語を新設しない。まず `content/glossary.yaml` を
  検索し、既存slugがあればそれを再利用する。

## 5. i18n(ja/en対)の書き方

- ファイルパス=slugの1:1対応を厳守する。EN側だけ別ディレクトリ名にしない。
- ENは「JAの逐語訳」ではなく「同じ内容を自然な技術英語で書いたもの」。
  構成(見出し数・段落の対応関係)は保つが、文単位の直訳は避ける
  (`docs/design/02_詳細設計書.md` §5.3「frontmatterに `translationOf` は
  持たない。パス一致が規約」)。
- ENレッスンのfrontmatterに `sourceHash` を付与する(JA原文更新時に
  追随漏れをCIが検知するための仕組み。値は暫定でよく、後続タスクで
  ハッシュ生成が自動化された場合はそちらに従う)。
- 演習YAMLの `tests` はja/enでロジックを完全一致させ、`name`/`hints` の
  文言のみ言語別に書く(§2-5参照)。

## 6. 著作権ポリシー(CLAUDE.md規則6 / 01_基本設計書.md §1.3)

書籍本文の転載・翻訳は恒久的に禁止。トピック(分散システムの一般的技術概念)を
独自解説する。`<BookRef chapter>` で該当章への参照(書誌情報のみ)を示し、
「詳しく知りたい人は原著を読む」導線を作る。原著の図版・具体的な文章表現の
言い換え引用(パラフレーズしただけの引用)も避け、自分の言葉で一次的に説明する。
