# glossary.yaml 確認・追加手順

`content/glossary.yaml` は用語の正(.claude/rules/i18n.md)。新出用語は
必ずここへ ja/en 両方を追加してから本文(`<Term>`)で使う。

## スキーマ(現行コードが正)

読み込み側は `lib/glossaryContent.ts` の `GlossaryEntrySchema`:

```yaml
- slug: <kebab-case-slug> # ロケール非依存の一意キー
  term:
    ja: <日本語の用語表記>
    en: <英語の用語表記>
  definition:
    ja: <日本語の定義文(独自解説。原著本文の引用・翻訳は禁止)>
    en: <英語の定義文(同上)>
```

02文書(§5.4)は `chapter` フィールドにも触れているが、現行の
`GlossaryEntrySchema` には存在しない。CLAUDE.mdの原則(実装済みコードが
正)に従い、`chapter` は追加しない。

`content/glossary.yaml` 自体が未作成の場合(用語集コンテンツ着手前)は、
新規作成してよい(`lib/glossaryContent.ts` の `loadGlossary` はファイル
不在時に空配列を返す設計であり、ファイルが存在しないこと自体はエラーでは
ない)。

## 手順

1. 翻訳対象レッスンに出てくる専門用語を洗い出す。
2. `content/glossary.yaml` を grep し、既存 `slug` に該当語が無いか確認する
   (表記ゆれで同義語が別slugになっていないかも確認する)。
3. 無ければ末尾にエントリを追加する(`term`/`definition` とも ja/en 両方
   必須)。
4. `<Term slug="...">` の表示テキスト(children)は glossary の `term.en`
   に揃える。
5. glossary.yaml を編集したら `npm run generate:curriculum` を実行し、
   `lib/generated/glossary.json` を再生成する(`npm test` 等は
   `pretest` フックで自動生成するため通常は不要だが、`npm run dev` で
   目視確認する場合は明示的に実行する)。
6. 最後に本skillの検証ループ(`npm run validate:content` → 修正 →
   再実行)を通す。
