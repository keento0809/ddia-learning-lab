# 演習定義YAMLスキーマ詳細

正: `lib/contracts/exercise.ts`(`ExerciseDefinitionSchema`)。このファイルは要約であり、
実装との差異があれば `lib/contracts/exercise.ts` を正とする。**このファイル自体(lib/contracts/配下)は
CLAUDE.md絶対規則2により変更禁止。** フィールドが足りない・型が合わないと感じた場合は
実装せず「依存未充足」として報告し止まること。

## トップレベルフィールド

| フィールド | 型                          | 意味                                                                 |
| ---------- | --------------------------- | --------------------------------------------------------------------- |
| `slug`     | string                      | `<module-slug>/<exercise-name>`。ファイルパスとは独立した論理ID       |
| `language` | `"js" \| "sql"`             | 採点方式。下記「SQL演習に関する注意」を参照                           |
| `entry`    | string                      | 採点対象としてexportする関数名(学習者向けの説明・テンプレの主眼)      |
| `template` | string(YAMLブロックスカラー) | 初期コード。コメントのみ言語別、シグネチャは同一                       |
| `tests`    | 配列、1件以上                | 下記「テストケース」参照。ja/en間でハッシュ一致必須(`name`除く)         |
| `timeoutMs`| 正の整数                     | 採点実行のハードタイムアウト(ms)。通常3000                             |
| `hints`    | `{ja, en}`の配列(省略可・既定`[]`) | 段階開放されるヒント文言                                          |

## テストケース(`tests[]`)

2種類のいずれかを各要素に指定する(discriminated union ではなく `z.union`)。

### 1. assertベース(`ExerciseAssertTestCaseSchema`)

```yaml
- id: t1
  name: # 省略可
    ja: "p50が中央値になる"
    en: "p50 equals the median"
  call: { fn: "percentile", args: [[1, 2, 3, 4, 5], 50] }
  assert: { type: "equals", value: 3 }
```

- `id`: 空文字不可。`GradedResult.id` としてそのまま返るので、後で失敗テストを特定できる名前にする
- `call.fn`: 呼び出す関数名(通常`entry`と同じだが、複数関数をexportする演習では異なってよい)
- `call.args`: 任意個の引数(JSON表現可能な値。`unknown[]`)
- `assert.type` は次の4種類:

| type         | 形                                          | 判定                                                                 |
| ------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `equals`     | `{ type: "equals", value: unknown }`         | 構造比較(`structuralEquals`)。NaN同士は等価、`0`と`-0`は非等価         |
| `deepEquals` | `{ type: "deepEquals", value: unknown }`     | `equals`と完全に同じ実装(設計上同一挙動と定義されている)               |
| `oneOf`      | `{ type: "oneOf", value: unknown[] }`        | `value`のいずれかと構造一致すればpass                                  |
| `matches`    | `{ type: "matches", value: string }`         | `value`を正規表現として実行結果の文字列表現に対して`test()`            |

- `equals`/`deepEquals`/`oneOf`は値に循環参照が含まれると自動的に不合格になる(`CircularReferenceError`をpass:falseに正規化)
- `matches`の`value`は不正な正規表現だとその場でpass:falseになる(採点全体はクラッシュしない)

### 2. プロパティベース(`ExercisePropertyTestCaseSchema`)

```yaml
- id: t2
  name: # 必須(assertベースと違い省略不可)
    ja: "ノード追加時の移動キーが約1/nである"
    en: "~1/n keys move when a node joins"
  kind: property
  check: "moveRatioNear(1/4, 0.15)"
```

- `check`は「関数呼び出し1つ」の式のみ(`関数名(引数, 引数, ...)`)。四則演算・括弧・数値・文字列リテラル・`true`/`false`/`null`のみサポートする小さな式パーサ(`parseCheckExpression`)が読む。JSの任意のコードは書けない
- `check`が参照する関数名(例の`moveRatioNear`)は**採点ハーネス側に演習ごと登録されたヘルパ**(`PropertyHelperRegistry`)である必要がある。ヘルパがどこで登録されるか(採点実行経路側の実装)は本スキルのスコープ外 — 既存ヘルパの有無を確認し、無ければ「依存未充足」として報告する。**存在しないヘルパ名を`check`に書いて演習を完成させたことにしてはならない**(CLAUDE.md絶対規則3)
- 模範解答のgrader passテストでヘルパを使う場合は`GraderDeps.propertyHelpers`に自前で登録して呼び出す(`references/verification.md`のコード例参照)

## `template` の書き方

- ja版・en版でシグネチャ・TODOの位置を揃え、コメントのみ翻訳する
- コメント以外(関数名・引数名・デフォルト値)は完全に同一にする。学習者が言語を切り替えても同じコードを書けることを保証するため
- YAMLの`|`ブロックスカラーを使う(改行・インデントをそのまま保持)

## SQL演習に関する注意

`docs/design/02_詳細設計書.md` §7.3には、SQL演習は`setupSql`(スキーマ+シードデータ)と`expected`(結果集合、順序無視/考慮の指定)を持つ設計が書かれている。しかし本スキル作成時点の`lib/contracts/exercise.ts`(`ExerciseDefinitionSchema`)には`setupSql`/`expected`に相当するフィールドが存在せず、`language: "sql"`は列挙値としてのみ定義されている。

**`language: sql`の演習を書く前に、必ず`lib/contracts/exercise.ts`の最新内容を確認すること。** 対応フィールドが実装されていなければ、それはSQLランナー関連タスク(T-201系)が未マージであることを意味する。存在しないフィールドを想像で書いてYAMLを完成させてはならない(CLAUDE.md絶対規則3・並列実行ルール10)。この場合は依存未充足として報告し、JS演習のみを対象に作業する。

## 実例ファイル

- `tests/fixtures/content/valid/ja/01-reliability/labs/percentile-lab.yaml`
- `tests/fixtures/content/valid/en/01-reliability/labs/percentile-lab.yaml`

上記2ファイルはassertベースの最小例。`docs/design/02_詳細設計書.md` §5.3にはpropertyベースを含むもう少し複雑な例(`consistent-hash.yaml`)がある。
