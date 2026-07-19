import type { ExerciseDefinition } from "@/lib/contracts/exercise";
import type { Locale } from "@/lib/contracts/common";

/**
 * S-06 演習ページ(T-108)のプレビュー/E2E検証用の固定演習データ。
 *
 * content/{ja,en}/**\/labs/*.yaml(T-006のコンテンツパイプライン)には現時点
 * (T-110/T-111着手前)で実データが1件も投入されていない。`/learn/[module]/lab/
 * [exercise]`(本番導線)はT-102のtocItemHref同様、コンテンツ投入後に実際の
 * 演習を表示するが、それまでは常に404となる(T-103のレッスンルートと同じ
 * 既知の暫定状態)。
 *
 * S-06自体の受入基準(Monaco統合/3ペイン/状態機械/結果パネル/ドラフト自動保存/
 * ヒント段階開放/⌘⏎/言語切替保持、Playwright2本)を安定して検証するには
 * content/へのfs依存なしに常時参照できる固定データが必要なため、T-000の
 * `lib/runner/exerciseFixture.ts`(walking skeleton用ダミー演習)と同じ設計判断
 * (実データではなくTSリテラルとして直接定義)を踏襲し、`/[locale]/lab-preview`
 * (本ファイルと対の新規ルート)からのみ参照する。
 *
 * equals/deepEquals形式のテストのみを使用する
 * (`lib/lab/buildRunRequest.ts`のドキュメント参照: oneOf/matches/property は
 * 現在のRunner統合ではT-107c時点で未配線のため)。
 */
const TEMPLATE: Record<Locale, string> = {
  ja: `// value を min〜max の範囲に収める関数を実装してください\nexport function clamp(value, min, max) {\n  // TODO: 実装\n}\n`,
  en: `// Implement a function that clamps value to the [min, max] range\nexport function clamp(value, min, max) {\n  // TODO: implement\n}\n`,
};

const HINTS = [
  { ja: "value が min より小さい場合は min を返します", en: "If value is below min, return min" },
  { ja: "value が max より大きい場合は max を返します", en: "If value is above max, return max" },
];

export function getDemoExercise(locale: Locale): ExerciseDefinition {
  return {
    slug: "lab-preview-demo/clamp",
    language: "js",
    entry: "clamp",
    template: TEMPLATE[locale],
    tests: [
      {
        id: "t1",
        name: { ja: "範囲内の値はそのまま返る", en: "a value inside the range is unchanged" },
        call: { fn: "clamp", args: [5, 0, 10] },
        assert: { type: "equals", value: 5 },
      },
      {
        id: "t2",
        name: { ja: "下限未満はminに丸められる", en: "a value below min is clamped to min" },
        call: { fn: "clamp", args: [-5, 0, 10] },
        assert: { type: "equals", value: 0 },
      },
      {
        id: "t3",
        name: { ja: "上限超過はmaxに丸められる", en: "a value above max is clamped to max" },
        call: { fn: "clamp", args: [15, 0, 10] },
        assert: { type: "equals", value: 10 },
      },
    ],
    timeoutMs: 3000,
    hints: HINTS,
  };
}

export const DEMO_EXERCISE_SOLUTION_CODE = `export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
`;
