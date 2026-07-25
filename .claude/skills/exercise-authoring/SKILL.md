---
name: exercise-authoring
description: DDIA Learning Labの演習(ラボ)YAML(content/{ja,en}/<module>/labs/*.yaml)を新規作成・修正する手順。模範解答をlabs/__solutions__/に置きgraderでpassするテストを同梱し、ja/en両言語のtests定義がハッシュ一致することまでを検証ループとして完了させる。「演習を作って」「ラボを追加して」「percentile-labにテストを足して」のように演習・ラボ・grader・模範解答に言及する依頼では、コンテンツ執筆(content-authoring)の一部としてでも必ずこのスキルを使う。演習定義YAML/model solution/grader passテストのいずれか一つだけを頼まれた場合も同様に使う。
---

# 演習(ラボ)YAML作成スキル

DDIA Learning Labの演習は「YAML定義(ja/en) + 採点ロジック共有 + 模範解答」の3点セットで初めて完成する。どれか1つでも欠けると `validate:content` かCIのテストが落ちる設計になっている。本スキルはその3点を過不足なく作り、実際にgraderで確認してから完了とするための手順を定義する。

## 前提として読むもの

- `lib/contracts/exercise.ts` — 演習定義YAMLのスキーマの正(zod)。本文で説明する内容は要約であり、実装との差異があれば**このファイルを正とする**。
- `references/schema.md` — YAMLの各フィールドの詳細と具体例。フィールドの意味に迷ったら読む。
- `references/verification.md` — 模範解答・grader passテスト・testsハッシュ一致検証の具体的な書き方。手順3〜5を実装する段になったら読む。
- `.claude/rules/i18n.md` — ja/en対管理の絶対規則。本スキルの手順はこれに従う。

## 全体フロー

1. 演習の設計を決める
2. YAML定義を ja/en 対で書く(testsロジックは同一、文言のみ両言語)
3. 模範解答を `labs/__solutions__/` に書く
4. grader passテストを模範解答と同じ場所に同梱する
5. 検証ループを回す(`validate:content` → grader passテスト → 修正 → 再実行)
6. 完了チェックリストで確認する

各ステップを順に説明する。

### 1. 演習の設計を決める

いきなりYAMLを書き始めない。まず以下を決めて、可能なら1〜2行で提示してから進める(執筆対象のレッスン内容と無関係な演習にならないようにするため):

- **配置場所**: `content/{ja,en}/<module-slug>/labs/<exercise-name>.yaml`(例: `content/ja/01-reliability/percentile-lab.yaml` ではなく、モジュールディレクトリ直下の `labs/` サブディレクトリに置く。実例は `tests/fixtures/content/valid/ja/01-reliability/labs/percentile-lab.yaml`)
- **slugフィールドの値**: `<module-slug>/<exercise-name>`(ファイルパスとは別に、YAML内の `slug` フィールドとしても持つ)
- **language**: `js` か `sql`。**`sql` を選ぶ前に `references/schema.md` の「SQL演習に関する注意」を読むこと** — 現状のcontractがJS演習の型しか持たない可能性がある
- **entry**: 採点対象としてexportする関数名。学習者が実装する対象そのもの
- **どのassert種別を使うか**: `equals` / `deepEquals` / `oneOf` / `matches` / `property`(詳細は`references/schema.md`)。レッスンで教えている概念を検証できる粒度のテストケースを2〜4件程度考える。1件だけだと合否の解像度が低すぎる
- **timeoutMs**: 通常3000。計算量の大きい演習(例: 大量キーのハッシュリング検証)は伸ばす根拠を明記する

### 2. YAML定義を ja/en 対で書く

`.claude/rules/i18n.md` の通り、**ja/enは必ず対で作成・更新する**。片方だけをコミットしてはならない。

手順:

1. `content/ja/<module>/labs/<name>.yaml` を先に書く(`template` のコメントは日本語、`tests[].name` / `hints[]` は `{ja, en}` 併記)
2. `content/en/<module>/labs/<name>.yaml` を作る。**`tests` の中身(`id`/`call`/`assert`/`kind`/`check`)はja版と1文字たりとも変えない**(`name`フィールドを除く)。`template` のコメントのみ英語に翻訳し、関数シグネチャ・TODOの位置は揃える
3. `tests[].name` と `hints[]` はどちらのファイルにも同じ `{ja, en}` オブジェクトをそのまま書く(文言自体は言語ごとに違うが、両方の言語のテキストを両ファイルに重複して持たせる。これは`tests/fixtures/content/valid/{ja,en}/01-reliability/labs/percentile-lab.yaml`が実例)

なぜテストロジックを完全一致させる必要があるか: `scripts/validate-content.ts` がテストケースから `name` を除いた残りをSHA-256でハッシュ化し、ja/en間で比較する(`hashExerciseTests`)。1文字でもズレるとハッシュ不一致で `validate:content` が失敗する。アルゴリズムの詳細は `references/verification.md` を参照。

YAMLフィールドの正確なスキーマ(assert種別ごとの形、propertyテストの `check` 式の書式など)は `references/schema.md` を参照。

### 3. 模範解答を `labs/__solutions__/` に置く

演習ディレクトリの下に `__solutions__/` サブディレクトリを作り、そこに模範解答の実装を置く:

```
content/ja/01-reliability/labs/
├── percentile-lab.yaml
└── __solutions__/
    ├── percentile-lab.solution.ts
    └── percentile-lab.solution.test.ts
```

`__solutions__/` はja側だけに置けばよい(模範解答のロジックは言語非依存で、テストロジックがja/en間でハッシュ一致している以上、ja側の解答がen側のtestsも自動的に満たす)。en側に重複作成する必要はない。

`__solutions__/` はファイルであってYAML(`.yaml`/`.yml`)ではないため、`lib/content.ts` のモジュールローダーが `labs/` を走査する際に**自動的に無視される**(`entry.isFile() && (.yaml|.yml)` フィルタ)。追加のビルド除外設定は不要。

模範解答は演習の `template` を「TODOを実装しきった状態」にしたものそのものであること。学習者が読める解答例ではなく、**graderの入力として実行されるコード**である。JSDoc等の解説コメントは付けない(このプロジェクトのコード例規約に従う)。

### 4. grader passテストを同梱する

模範解答が実際にgraderでpassすることを、レビュー時にも再現可能な形でテストとして残す。`__solutions__/*.solution.test.ts` に以下のパターンで書く(vitestは`content/**`配下の`*.test.ts`も自動収集するため、追加設定は不要):

```ts
// content/ja/01-reliability/labs/__solutions__/percentile-lab.solution.test.ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ExerciseDefinitionSchema } from "@/lib/contracts/exercise";
import { gradeExercise } from "@/lib/runner/grader";
import * as solution from "./percentile-lab.solution";

describe("percentile-lab 模範解答", () => {
  it("graderで全テストにpassする", () => {
    const yamlPath = path.join(__dirname, "..", "percentile-lab.yaml");
    const raw = parseYaml(fs.readFileSync(yamlPath, "utf-8"));
    const exercise = ExerciseDefinitionSchema.parse(raw);

    const summary = gradeExercise(exercise.tests, {
      resolveFn: (name) => (solution as Record<string, unknown>)[name],
    });

    expect(summary.result).toBe("pass");
  });
});
```

この形が意味すること・注意点は `references/verification.md` に詳しい(`gradeExercise` の戻り値の形、`property` 種別テストでヘルパを登録する場合の書き方、複数演習をまとめて検証する場合の書き方など)。

### 5. 検証ループを回す

これは1回書いて終わりにする作業ではない。**模範解答がgraderでpassするか実際に確認し、落ちたら直して再実行する**というループを完了報告の前に必ず回す:

1. `npm run validate:content` を実行し、出力を確認する。ja/en slug対応漏れ・testsハッシュ不一致・YAMLスキーマ不正はここで検出される
2. `npm run test -- <solution.test.tsのパス>`(または `npm run test` 全体)を実行し、手順4のgrader passテストの結果を確認する
3. どちらかが失敗したら、原因を読んで直す:
   - `validate:content` のハッシュ不一致 → ja/enのtests定義が完全一致していない(空白・キー順・値の型のズレも含む)。`references/verification.md` のハッシュアルゴリズムを見て、何が比較対象に入るか確認する
   - grader passテストの失敗 → 模範解答の実装が誤っているか、`assert.value` が意図と違う。`gradeExercise` の `perTest[].diff` を`console.log`等で見て原因を特定する
   - YAMLスキーマ不正 → `lib/contracts/exercise.ts` を再確認し、フィールド名・型を合わせる(このファイル自体は変更禁止)
4. 直したら手順1からやり直す。**「たぶん直った」で止めず、コマンドの出力が実際にgreenになったことを確認してから次に進む**

これはCLAUDE.md規則11(検証出力は必ず表示する)にも対応する。完了報告には、このループの最終成功分のログをそのまま貼る。

### 6. 完了チェックリスト

- [ ] `content/ja/<module>/labs/<name>.yaml` と `content/en/<module>/labs/<name>.yaml` の両方が存在する
- [ ] 両ファイルの `tests` ロジック(`name`以外)が完全一致している
- [ ] `content/ja/<module>/labs/__solutions__/<name>.solution.ts` が存在し、TODOなしで実装が完了している
- [ ] `content/ja/<module>/labs/__solutions__/<name>.solution.test.ts` が存在し、`gradeExercise` の結果が `"pass"` であることを検証している
- [ ] `npm run validate:content` が exit 0 で成功している(出力を確認済み)
- [ ] `npm run test`(該当テストを含む)が成功している(出力を確認済み)
- [ ] `template` のコード例はコピペで動く形になっている(構文エラーがない)
- [ ] 原著『Designing Data-Intensive Applications』本文の引用・翻訳を含んでいない(CLAUDE.md絶対規則6)
- [ ] 新出用語があれば `content/glossary.yaml` にja/en両方を追加している

## よくある失敗と回避

- **en側のtestsを「だいたい同じ」で書いてしまう**: ハッシュ一致は完全一致を要求する。ja版のtests部分をそのままコピーしてnameだけ翻訳するのが最も安全
- **模範解答をgraderにかけずに「動くはず」で済ませる**: 手順5のループを飛ばさない。特に`property`種別のテストは目視で正誤判断しづらいため、必ず実行して確認する
- **`__solutions__/` をen側にも複製してしまう**: 不要(手順3参照)。i18n規約の「ja/en対で作成」はコンテンツ本体(YAML)の話であり、模範解答は言語非依存の実装なので対象外
- **entryとtestsのcall.fnが食い違う**: 採点は各テストケースの `call.fn` で解決されるため、`entry` フィールドと実際にexportした関数名を必ず一致させる(学習者への提示用の情報と採点対象がズレるとテンプレートと解答が矛盾する)
