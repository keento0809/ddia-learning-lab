# 執筆完了チェックリスト

コミット前に上から順に確認する。`validate:content` が検出する項目には
[自動]、目視確認が必要な項目には[目視]を付けている。

## ファイル構成

- [ ] `content/ja/{slug}/` と `content/en/{slug}/` の両方を作成・更新した
- [ ] `module.yaml` がja/en両方にあり、`slug`/`order`/`minutes` が一致している
      (`title` のみ言語別に翻訳) [自動: 欠落は検出、値の一致は目視]
- [ ] レッスンMDXのファイル名がja/enで完全一致している [自動]
- [ ] `quiz.yaml` の有無がja/enで揃っている(片方だけ存在しない) [自動]
- [ ] `labs/*.yaml` のファイル名がja/enで完全一致している [自動]

## frontmatter / メタ情報

- [ ] レッスンMDXのfrontmatterに `title`/`order`/`minutes` がある [自動]
- [ ] EN側レッスンに `sourceHash` を付与した [目視]
- [ ] `module.yaml` の `minutes` がレッスン `minutes` 合計とおおむね一致している [目視]

## 本文

- [ ] `# ` (h1) がfrontmatterの `title` と一致している [目視]
- [ ] 原著本文の引用・翻訳が含まれていない(独自解説のみ) [目視、CLAUDE.md規則6]
- [ ] UI文言をMDX本文に直接ハードコードしていない(MDXコンポーネント経由) [目視、CLAUDE.md規則5]
- [ ] 相対リンク(`[text](./other-lesson)`)の参照先が存在する [自動]
- [ ] `<Figure>` の `alt` が意味のある説明文になっている [目視]
- [ ] `<Term slug>` で参照した用語がすべて `content/glossary.yaml` に
      ja/en両方で登録済み [目視。未登録でもエラーにはならないため要注意]
- [ ] `<Viz name>` が実在するVizコンポーネント名を指している(未実装章では
      使わない) [目視]
- [ ] `<BookRef chapter>` の章番号が原著の対応章と一致している [目視]

## quiz.yaml

- [ ] `type: single` の設問について、`correctOptionIds` が指す選択肢が
      `options` 配列内で何番目かを数え、モジュール内でその位置(1〜4番目)が
      特定の1箇所に偏っていない(おおむね均等)ことを確認した
      [目視。特定位置が突出して多い/ある位置が0件、は要修正のサイン]
- [ ] 上記の位置調整は `options` の並び替え(`id`+`label`のペアを維持)のみで
      行い、`correctOptionIds` の値やプロンプト・選択肢の文言は変更していない
      [目視]

## 演習(labs/*.yaml)

- [ ] `slug`/`language`/`entry`/`template`/`tests`/`timeoutMs` を
      `lib/contracts/exercise.ts` の型に沿って書いた [自動(zod検証)]
- [ ] `tests` の `id`/`call`/`assert`/`kind`/`check`(`name`/`hints`を除く)が
      ja/enで完全一致している(ロジック共有) [自動: ハッシュ一致検証]
- [ ] `template` はコメントのみ言語別に翻訳し、コード自体は同一である [目視]
- [ ] `hints` はヒントとして機能する分量か(答えをそのまま書いていないか) [目視]

## 検証コマンド(実行結果を必ず出力に貼る)

- [ ] `npm run validate:content` が成功している(最終success出力を貼付) [自動]
- [ ] レッスンページの表示に影響する変更(新規モジュール追加等)を伴う場合、
      verify-webappスキルの手順(dev server起動 → `/ja` `/en` 両方で目視確認
      → console error 0 → 言語切替で状態保持)も実施した [目視]

## コミット

- [ ] ja/enの変更を同一コミット(または同一PR内)に含めた
      (片方だけの追加・変更をしない) [目視、[[i18n.md]]]
