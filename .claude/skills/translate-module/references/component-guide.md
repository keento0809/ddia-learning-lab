# MDXカスタムコンポーネント別 翻訳規約

対象: `components/mdx/*.tsx`(T-103, 02§4.1)。共通原則は「タグ・属性・出現順序は
一切変えず、ロケール別MDXファイルに直書きされているテキストのみ翻訳する」。
UIクローム(ボタンラベル等)はコンポーネント内部が `messages/{ja,en}.json` から
自動解決するため、MDX側に文言が現れない箇所は触らない。

## 見出し・本文・リンク(素のMarkdown)

- 見出しレベル(`#`, `##`, ...)と出現順序は変えない。
- リンク `[text](path)` は `text` のみ翻訳し、`path` は変更しない
  (相対パスは `scripts/validate-content.ts` のリンク切れ検査対象。パスを
  変えるとエラーになる)。

## `<Callout type="info|warn|tip">children</Callout>`

- `type` は変更しない。
- `children`(本文)のみ翻訳する。
- ラベル(「情報」「注意」「ヒント」相当)はコンポーネント内部で
  `messages` から解決されるため、MDX側には現れない。

## `<Figure src="..." alt="..." captionKey="..." />`

- `src` と `captionKey` は変更しない(`captionKey` は
  `messages/{ja,en}.json` の `lesson.figureCaptions` を指すキーで、
  両ロケールに同じキーが存在している前提)。
- `alt` はMDXに直書きされた文字列なので翻訳する。

## `<BookRef chapter={N} />`

- `chapter` は変更しない。他のprops(タイトル/著者/ラベル)は無く、
  全て `messages` 側で解決されるため翻訳対象がない。

## `<CodeBlock lang="..." runnable={true|false}>code</CodeBlock>`

- `lang` と `runnable` は変更しない。
- `children`(コード本文)は識別子・ロジックを変更しない。翻訳するのは
  コード中の**コメントのみ**(labs YAMLの `template` と同じ扱い、
  02§5.3「初期コード(コメントのみ言語別)」)。

## `<QuizInline id="..." prompt="..." options={[...]} correctOptionId="..." explanation="..." />`

- `id`、`options[].id`、`correctOptionId` は内部識別子なので変更しない。
- `prompt`、`options[].label`、`explanation` は翻訳する。

## `<Term slug="...">children</Term>`

- `slug` は変更しない(`content/glossary.yaml` のキーはロケール非依存)。
- `children`(画面に表示される用語表記)は `content/glossary.yaml` の
  `term.en` に**揃える**(その場での直訳ではなく、glossaryが正)。
- `slug` が glossary に未登録の場合は、翻訳前に
  references/glossary-workflow.md の手順で追加してから使う。

## `<Viz name="..." preset="..." />`

- `name` と `preset` は変更しない。コンポーネント内部でのみ解決され、
  MDX側に文言は現れない。
