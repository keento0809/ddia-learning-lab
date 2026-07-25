# 模範解答・grader passテスト・testsハッシュ一致の詳細

SKILL.mdの手順3〜5を実装する際の具体的なコードとアルゴリズムをまとめる。

## 1. testsハッシュ一致アルゴリズム(`scripts/validate-content.ts`)

```ts
function hashExerciseTests(exercise: ExerciseEntry): string {
  const strippedTests = exercise.definition.tests.map((testCase) => {
    const clone = { ...testCase };
    delete clone.name;
    return clone;
  });
  return createHash("sha256").update(stableStringify(strippedTests)).digest("hex");
}
```

- 比較対象は`tests`配列から**各要素の`name`フィールドを取り除いたもの**。つまり`id`/`call`/`assert`/`kind`/`check`は一致必須、`name`(表示文言)だけ言語ごとに違ってよい
- `stableStringify`はオブジェクトのキーをソートしてから`JSON.stringify`するため、YAML上でのキー順序は結果に影響しない。ただし**配列の順序・値の型(数値と文字列など)はJSON表現に反映される**ので、`args: [1, 2]`と`args: ["1", "2"]`は別物として扱われる
- 実務上一番安全なのは、ja版を書いた後、en版の`tests:`ブロックをまるごとコピーして`name`の文言だけ翻訳する進め方。手で再入力すると空白やクォートの違いでハッシュがズレることがある(ズレても値としては同じに見えるため気づきにくい)

`npm run validate:content`はこのハッシュをja/en間で比較し、不一致なら該当ファイルパスとともにエラー報告する。

## 2. `labs/__solutions__/`の実装ファイル

```ts
// content/ja/01-reliability/labs/__solutions__/percentile-lab.solution.ts
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[index];
}
```

- exportする関数名は、その演習の全テストケースが`call.fn`で参照する名前と一致させる(通常は`entry`と同じ)
- TypeScriptで書いてよい(vitestがトランスパイルする)。学習者向けJSテンプレとは別物なので型注釈を付けてよい
- コメントは付けない(このプロジェクトのコード規約: WHYが非自明な場合のみ)

## 3. grader passテストのフルパターン

### assertベースのみの演習(最小形)

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
    // 失敗時に原因を素早く特定するため、各テストの結果も見えるようにしておく
    if (summary.result !== "pass") {
      console.error(summary.perTest.filter((t) => !t.pass));
    }
  });
});
```

### `property`種別のテストを含む演習

`check`が参照するヘルパを`propertyHelpers`として自前で渡す必要がある。ヘルパの実装自体が採点ハーネス側(実行経路)に存在しない場合は、それを模造してテストを通してはならない — 依存未充足として報告する(SKILL.md「よくある失敗と回避」参照)。ヘルパが既にどこかに実装済みであれば、それをimportして使う:

```ts
import { moveRatioNear } from "@/lib/runner/propertyHelpers/hashRing"; // 実在パスは要確認

const summary = gradeExercise(exercise.tests, {
  resolveFn: (name) => (solution as Record<string, unknown>)[name],
  propertyHelpers: { moveRatioNear },
});
```

### `gradeExercise`の戻り値

```ts
type GradeSummary = {
  result: "pass" | "fail"; // 全テスト合格時のみ"pass"
  score: number;            // round(passed/total*100)
  perTest: GradedResult[];  // {id, pass, actual?, diff?, error?}
};
```

`result`だけでなく、失敗時は`perTest`の`diff`/`error`を見ると原因がすぐ分かる(構造比較の失敗なら`diff`に期待値/実際値、関数が見つからない・例外を投げた場合は`error`にメッセージが入る)。

## 4. 検証ループの実行例

```bash
npm run validate:content
npm run test
```

両方成功したログを完了報告に貼る。片方でも失敗している状態を「検証済み」として報告してはならない(CLAUDE.md規則3・11)。

`npm run test`は単体で走らせると`pretest`フックとして`generate:curriculum`と`validate:content`を先に実行する(`package.json`)。そのため実務上は`npm run test`単体を回すだけで両方の検証を兼ねられるが、`validate:content`のエラーメッセージだけを素早く見たい場合は`npm run validate:content`を直接呼んでもよい。
