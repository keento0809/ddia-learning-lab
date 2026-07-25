---
name: translate-module
description: content/ja/配下の完成済み教材モジュール(module.yaml/レッスンMDX/quiz.yaml/演習YAML)をcontent/en/へ翻訳し対にする手順。glossary.yamlによる用語統一・MDX構造保持・sourceHash付与・validate:content検証ループを行う。「モジュールをEN翻訳して」「英語版を作って」「content/en/に対訳を作成して」等の依頼で使う。
---

# translate-module

content/ja/\<module-slug\>/ にある完成済み教材を content/en/\<module-slug\>/ へ翻訳し、
ファイルパス=slugの1:1対応(.claude/rules/i18n.md)を満たす対訳を作る手順。

## いつ使うか

- content/ja/\<module-slug\>/ の教材(レッスンMDX・module.yaml・quiz.yaml・labs/\*.yaml)が
  完成しており、対応する content/en/\<module-slug\>/ が未作成、または ja 側更新に
  追随できていないとき。
- 依頼が「JA→EN翻訳」「英語版を作って」の形を取るとき。

## 前提(ソースの正)

- ファイルパス=slugで1:1対応。片方だけの作成・変更は禁止(.claude/rules/i18n.md)。
- 演習YAMLの `tests`(id/call/assert/kind/check、name除く)はja/en完全一致が必須
  (ハッシュ照合。scripts/validate-content.ts の `hashExerciseTests`)。
- 用語は `content/glossary.yaml` を正とする(スキーマは lib/glossaryContent.ts の
  `GlossaryEntrySchema`: `slug` / `term.{ja,en}` / `definition.{ja,en}`。
  02文書は `chapter` フィールドに触れているが現行コードスキーマには存在しないため
  追加しない — 実装済みコードが正)。
- `lib/contracts/` 配下のスキーマは変更禁止(CLAUDE.md規則2)。翻訳中にスキーマ不足に
  気づいたら実装を止めて報告する。
- CLAUDE.md規則6: 原著『Designing Data-Intensive Applications』本文の引用・翻訳を
  含めない。翻訳対象はチーム独自執筆のJA教材であり、英訳中にBookRefの書誌情報以外へ
  原著本文を混入させない。

## 手順

### 1. スコープ確認

- `content/ja/<module-slug>/` 配下の全ファイル(module.yaml, \*.mdx, quiz.yaml,
  labs/\*.yaml)を列挙する。
- `content/en/<module-slug>/` に同名ファイルが無い、または古いことを確認する。
- 関連スキーマ(`lib/contracts/module.ts`, `lib/contracts/exercise.ts`,
  `lib/contracts/common.ts`)が実装済みであることを確認する。無ければ依存未充足
  として作業を止め、その旨を報告する(CLAUDE.md規則10)。

### 2. module.yaml

`slug` / `order` / `minutes` は ja と完全に同じ値のまま複製し、`title` のみ英訳する。

### 3. レッスンMDX(\*.mdx)

- frontmatter: `title` を英訳、`order` / `minutes` は ja と同値。
- 本文: MDXコンポーネントの構造(タグ・属性・出現順序)を一切変えず、テキストのみ
  翻訳する。コンポーネントごとの規約は references/component-guide.md を参照。
- 未知の専門用語が出てきたら翻訳前に glossary を確認・登録する
  (references/glossary-workflow.md)。
- 翻訳後、sourceHashを付与する(手順5)。

### 4. quiz.yaml / labs/\*.yaml

- `quiz.yaml`: スキーマは未確定(YAML構文のみが検証対象、`lib/content.ts` の
  `loadModule` 参照)。キー構造を保ったまま文言のみ翻訳する。
- `labs/*.yaml`: `tests[].name` と `hints[]` は `LocalizedTextSchema({ja,en})` で
  1オブジェクトに両言語を内包済みのため、ja側からそのままコピーし変更しない。
  翻訳が必要なのは `template` 内のコード**コメントのみ**(識別子・ロジックは
  変更禁止 — 変更するとテストハッシュが不一致になる)。

### 5. sourceHashの付与

目的: JA原文が後で更新された際、EN側の追随漏れを将来のCI(02§5.1)が警告できる
ようにする印を残すこと。現時点で `scripts/validate-content.ts` はこの値を
検証していない(未実装。将来のT-404で追加予定)が、規約として必ず付与する。

```bash
shasum -a 256 content/ja/<module-slug>/<lesson>.mdx | awk '{print $1}'
```

得られたハッシュを対応する EN mdx の frontmatter に `sourceHash: <hash>` として
追加する(ja側フロントマターには付与しない — 02§5.1「ENに持たせる」)。

### 6. 検証ループ(必須、CLAUDE.md規則11)

```bash
npm run validate:content
```

出力を必ず会話に表示する(サイレント実行禁止)。エラー種別(slug欠落/レッスン
slug欠落/quiz有無不一致/演習testsハッシュ不一致/リンク切れ)を1件ずつ修正し、
**0件になるまで再実行を繰り返す**。部分的に緑の状態で次の手順に進まない。

続けて通常の受入コマンドも実行する(いずれも内部で validate:content を再実行
する構成のため、明示的な追加コストはない):

```bash
npm run lint && npm run typecheck && npm run test
```

### 7. 完了報告

- 翻訳したモジュールslug、`validate:content` の結果、sourceHash付与状況を
  対応表として提示する。
- スコープ外(他モジュールの翻訳、UIコンポーネントの変更等)は実施しない。

## やってはいけないこと

- `lib/contracts/` 配下のスキーマ変更(CLAUDE.md規則2)。
- 演習 `tests`(id/call/assert/kind/check)の値を翻訳中に書き換えること
  (ハッシュ不一致の原因になる)。
- `<Term slug="...">` の `slug` 属性を EN 側で変更すること(glossaryのキーは
  ロケール非依存)。
- `messages/{ja,en}.json` が解決するUI文言(ボタンラベル等のコンポーネント内部
  chrome)をMDX側に埋め込むこと。MDX側のpropsとして渡す文言(prompt/label/
  explanation/altなど、ロケール別MDXファイルに直書きされる文言)のみ翻訳対象。
- 原著DDIA本文の引用・翻訳の混入(CLAUDE.md規則6)。

## 参照

- references/component-guide.md: MDXカスタムコンポーネント別の翻訳規約
- references/glossary-workflow.md: glossary.yaml確認・追加手順
