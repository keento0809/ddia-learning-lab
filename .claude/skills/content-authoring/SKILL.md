---
name: content-authoring
description: 教材モジュール(レッスンMDX・module.yaml・quiz.yaml・演習YAML)をcontent/ja/とcontent/en/に新規執筆または改訂するときに使う。「モジュール◯の教材を書いて」「レッスンを追加して」「T-110/T-111系タスク(Part教材 JA/EN)を実装して」といった執筆依頼、既存レッスンの加筆・EN追随更新で発火する。ja/en対の同時作成・glossary.yaml登録・npm run validate:contentによる検証ループの手順を提供する。
---

# 教材モジュール執筆(content-authoring)

`content/ja/**` と `content/en/**` にレッスンMDX・`module.yaml`・`quiz.yaml`・演習YAMLを
追加・編集する作業(T-110/T-111系タスクを含む)はすべてこの手順に従う。
1本のモジュールをja/en両方揃えて `npm run validate:content` green まで仕上げることが
完了条件。

## 1. モジュールの構成要素

```
content/{ja,en}/{module-slug}/
├─ module.yaml              # メタ情報: slug, title, order, minutes
├─ 01-xxx.mdx                # レッスン(3〜5本、frontmatter必須)
├─ 02-yyy.mdx
├─ quiz.yaml                 # 選択式クイズ(§4 参照。スキーマ未確定)
└─ labs/
   └─ xxx-lab.yaml           # 演習(1〜2本)
```

- `{module-slug}` は `content/ja/` と `content/en/` で**完全に同じ文字列**にする
  (ファイルパス=slugの1:1対応、[[i18n.md]]参照)。レッスンのファイル名も同様。
- モジュール構成(全12モジュールの主題・想定演習)は
  `docs/design/01_基本設計書.md` §3 を正とする。このスキルはそこで決まった
  トピックを実際のファイルへ落とし込む「執筆の型」を担当する。

## 2. 執筆手順

1. **module.yaml をja/en両方作成する**
   ```yaml
   slug: 01-reliability
   title: 信頼性の基礎        # enファイルではtitleを英訳する。slug/order/minutesは共通
   order: 1
   minutes: 45
   ```
   `slug`/`title`/`order`/`minutes` が必須(`lib/contracts/module.ts`)。`order` は
   カリキュラム全体の通し番号(01_基本設計書.md §3 の#列)。`minutes` はレッスン
   所要時間の合計目安。

2. **レッスンMDXを書く**。frontmatterに `title`/`order`/`minutes` 必須
   (`lib/content.ts` の `LessonFrontmatterSchema`)。EN側にはさらに `sourceHash`
   を付与し、JA原文更新時にENの追随漏れを検知できるようにする([[i18n.md]])。
   本文中では下記の7種のMDXカスタムコンポーネントが使える。詳細props・
   使い分けは `references/style-guide.md` を参照。

   | コンポーネント | props | 用途 |
   |---|---|---|
   | `<Callout type="info\|warn\|tip">` | type | 注記ボックス |
   | `<Figure src alt captionKey?>` | src, alt, captionKey | 図+キャプション |
   | `<Term slug>` | slug | 用語集ポップオーバー(要glossary.yaml登録) |
   | `<Viz name preset?>` | name, preset | 可視化コンポーネントの埋め込み |
   | `<CodeBlock lang runnable?>` | lang, runnable | コード例。runnableは表示のみで実行は未接続([[known-limitations]]参照) |
   | `<QuizInline id prompt options correctOptionId explanation?>` | 一式 | 本文中1問クイズ(自己完結) |
   | `<BookRef chapter={n}>` | chapter | 原著章への書誌参照カード(本文引用は含めない) |

   本文中のリンクは同一content配下の相対パス(`./01-xxx` のような拡張子なし
   参照)のみが `validate:content` のリンク切れ検査対象。

3. **新出用語は先にglossary.yamlへ登録してから本文で `<Term>` を使う**
   (`content/glossary.yaml`、`{ slug, term: {ja, en}, definition: {ja, en}, chapter }`
   の配列。[[i18n.md]] 「用語はcontent/glossary.yamlを正とする」)。未登録slugを
   指定すると画面上はポップオーバーなしのプレーンテキストにフォールバックする
   (エラーにはならないが用語集としての価値が出ないため、執筆時に必ず登録する)。

4. **quiz.yaml を置く**。設問スキーマは本執筆時点(S-05/T-106着手前)では
   未確定のため、`validate:content` はYAMLとして解析できることのみを検証する。
   スキーマが正式決定するまでは `questions: []` で仮置きするか、既存モジュールに
   倣う。設問形式を独自に確定させない(CLAUDE.md規則10、依存未充足の領域)。

   **正解選択肢の位置バイアスを避ける**: `type: single` の設問は
   `correctOptionIds` が指す選択肢が `options` 配列の何番目にあるかで
   「正解の位置」が決まる。LLMによる設問生成では正解を特定の位置
   (例: 常に2番目)に置きがちな自己バイアスが生じやすいため、**モジュール内の
   単一選択設問全体を通して、正解の位置を1〜4番目(選択肢数がそれより多い/
   少ない設問が混在する場合はその範囲)にほぼ均等に分散させること**。
   特定の位置に偏らせてはならない。`options` 配列の並び替え(`id`と`label`は
   常に対で移動させ、`correctOptionIds` の値そのものは変更しない)で調整する。
   `type: multiple`(複数正解)の設問は位置分散の対象外でよい。

5. **演習YAML(`labs/*.yaml`)を書く**。`slug`/`language`/`entry`/`template`/
   `tests`/`timeoutMs`/`hints` の構造は `lib/contracts/exercise.ts` を正とする。
   **`tests` はja/enで意味的に同一のロジックを保つこと**
   (`name`/`hints`以外のフィールドをハッシュ化して比較検証される。
   [[i18n.md]] 「演習YAMLのtestsはロジック共有」)。`template` のコメントのみ
   言語別に翻訳する。

6. **検証ループを回す(§3)**。green になるまで1〜5を修正して繰り返す。

7. **ja/enを同時にコミットする**。片方だけの追加・変更は禁止
   ([[i18n.md]])。

## 3. 検証ループ(必須・サイレント実行禁止)

```bash
npm run validate:content
```

- 実行結果は必ず会話に表示する(CLAUDE.md規則11)。成功時の出力例:
  ```
  content検証: 成功(N件のslug)
  slugマニフェストを書き出しました: .../content/generated/slug-manifest.json
  ```
- 失敗時は `✗ <ファイルパス>: <理由>` が1行ずつ列挙される。主な原因と対応:
  - `モジュール/レッスン/演習YAMLが欠落しています` → ja/enどちらかに追加漏れ。
    対になるファイルを作成する。
  - `frontmatter必須項目(title, order, minutes)が不足/不正です` →
    module.yamlまたはレッスンMDX先頭の`---`ブロックを修正する。
  - `演習testsのハッシュが一致しません` → ja/en `labs/*.yaml` の `tests` の
    `name`/`hints`以外(`id`/`call`/`assert`/`kind`/`check`)がずれている。
    ロジックを完全一致させる(文言だけを変える)。
  - `リンク切れ` → 相対パス参照先のファイル名・拡張子省略を確認する。
- **1回のvalidate:content成功をもって完了としない**。修正のたびに再実行し、
  最終success出力を完了報告に貼る。UI(レッスンページ等)に影響する変更を
  伴う場合は verify-webapp スキルの手順も別途行う。

## 4. 著作権・文言ルール(絶対)

- 本文・コメント・演習文言に原著『Designing Data-Intensive Applications』の
  引用・翻訳を含めない(CLAUDE.md規則6)。`<BookRef chapter>` は書誌情報の
  提示のみで、本文の要約的言い換えであっても引用に近い記述は避ける。
  トピックそのものは独自解説で説明する。
- UI文言(ボタンラベル等)をMDX本文にハードコードしない。MDXコンポーネントの
  ラベルは `messages/{ja,en}.json` 経由で既に解決されている
  (`components/mdx/*.tsx` 参照)ため、本文側で追加のUI文言を書く必要は
  通常ない。

## 5. references/ の使い分け

| ファイル | 読むタイミング |
|---|---|
| `references/style-guide.md` | 文体・構成・MDXコンポーネントの詳細props・用語運用を確認したいとき |
| `references/checklist.md` | 執筆完了後、コミット前の最終確認 |
| `references/example-module.md` | ファイル構成・最小構文の具体例を見たいとき |

## 6. 既知の制約 {#known-limitations}

- `<CodeBlock runnable>` の「試す」ボタンは表示のみで、実際のコード実行
  (Runner統合、T-107c)には未接続([[CLAUDE.md]]規則10の依存未充足領域)。
  演習本体の実行・採点は `labs/*.yaml` 側で完結するため、レッスン内の
  `<CodeBlock>` は読み取り専用の説明用コード例として使う。
- `quiz.yaml` のスキーマは未確定(§2-4参照)。設問形式を新規に設計しない。
