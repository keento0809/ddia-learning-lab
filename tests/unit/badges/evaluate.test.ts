import { describe, expect, it } from "vitest";
import { evaluateNewlyEarnedBadges, type BadgeEvaluationContext } from "@/lib/badges/evaluate";
import type { CurriculumModuleSummary } from "@/lib/curriculum";

/**
 * 03文書T-303「付与条件(criteria jsonb)評価のテーブル駆動テスト」。
 * 02§2.1(badges.criteria jsonb)/§3.1(newBadges)の評価ロジック
 * (lib/badges/evaluate.ts)を対象にする。
 */

function mod(slug: string, order: number): CurriculumModuleSummary {
  return { meta: { slug, title: slug, order, minutes: 30 }, lessonCount: 1 };
}

// Part I: 01/02, Part II: 05/06, Part III: 10 (partForOrderの区分: <=4:I, <=9:II, それ以外:III)
const MODULES: CurriculumModuleSummary[] = [
  mod("01-a", 1),
  mod("02-b", 2),
  mod("05-c", 5),
  mod("06-d", 6),
  mod("10-e", 10),
];

/** モジュールごとの構成item(lesson+quiz)を固定した簡易フィクスチャ */
const MODULE_ITEM_KEYS: Record<string, string[]> = {
  "01-a": ["lesson:01-a/l1", "quiz:01-a/quiz"],
  "02-b": ["lesson:02-b/l1", "quiz:02-b/quiz"],
  "05-c": ["lesson:05-c/l1", "quiz:05-c/quiz"],
  "06-d": ["lesson:06-d/l1", "quiz:06-d/quiz"],
  "10-e": ["lesson:10-e/l1", "quiz:10-e/quiz"],
};

function makeContext(doneItemKeys: readonly string[]): BadgeEvaluationContext {
  return {
    modules: MODULES,
    itemKeysForModule: (moduleSlug) => MODULE_ITEM_KEYS[moduleSlug] ?? [],
    doneItemKeys: new Set(doneItemKeys),
  };
}

const PART1_COMPLETE = { slug: "part1-complete", criteria: { type: "part_complete", part: "I" } };
const PART2_COMPLETE = { slug: "part2-complete", criteria: { type: "part_complete", part: "II" } };
const PART3_COMPLETE = { slug: "part3-complete", criteria: { type: "part_complete", part: "III" } };

const ALL_PART1_DONE = ["lesson:01-a/l1", "quiz:01-a/quiz", "lesson:02-b/l1", "quiz:02-b/quiz"];
const ALL_PART2_DONE = ["lesson:05-c/l1", "quiz:05-c/quiz", "lesson:06-d/l1", "quiz:06-d/quiz"];

describe("evaluateNewlyEarnedBadges (T-303)", () => {
  const cases: Array<{
    name: string;
    definitions: { slug: string; criteria: unknown }[];
    alreadyGranted: string[];
    doneItemKeys: string[];
    expected: string[];
  }> = [
    {
      name: "Part Iの全item完了でpart1-completeが新規付与される",
      definitions: [PART1_COMPLETE],
      alreadyGranted: [],
      doneItemKeys: ALL_PART1_DONE,
      expected: ["part1-complete"],
    },
    {
      name: "Part Iの一部item未完了ではpart1-completeは付与されない",
      definitions: [PART1_COMPLETE],
      alreadyGranted: [],
      doneItemKeys: ["lesson:01-a/l1", "quiz:01-a/quiz", "lesson:02-b/l1"], // 02-b/quiz欠落
      expected: [],
    },
    {
      name: "既に付与済みのバッジは条件充足済みでも再付与しない",
      definitions: [PART1_COMPLETE],
      alreadyGranted: ["part1-complete"],
      doneItemKeys: ALL_PART1_DONE,
      expected: [],
    },
    {
      name: "Part IとPart IIを同時に満たす場合は両方新規付与される",
      definitions: [PART1_COMPLETE, PART2_COMPLETE],
      alreadyGranted: [],
      doneItemKeys: [...ALL_PART1_DONE, ...ALL_PART2_DONE],
      expected: ["part1-complete", "part2-complete"],
    },
    {
      name: "対象モジュールが存在しないPartの条件は充足しない(空配列扱い)",
      definitions: [{ slug: "part-none-complete", criteria: { type: "part_complete", part: "III" } }],
      alreadyGranted: [],
      doneItemKeys: ["lesson:10-e/l1"], // 10-e/quiz欠落 → Part III未完了
      expected: [],
    },
    {
      name: "Part IIIの全item完了でpart3-completeが新規付与される",
      definitions: [PART3_COMPLETE],
      alreadyGranted: [],
      doneItemKeys: ["lesson:10-e/l1", "quiz:10-e/quiz"],
      expected: ["part3-complete"],
    },
    {
      name: "未知のcriteria.typeは安全側で未充足として扱う",
      definitions: [{ slug: "mystery-badge", criteria: { type: "unknown_future_type" } }],
      alreadyGranted: [],
      doneItemKeys: ALL_PART1_DONE,
      expected: [],
    },
    {
      name: "criteriaが不正な形(nullなど)でも例外を投げず未充足として扱う",
      definitions: [{ slug: "broken-badge", criteria: null }],
      alreadyGranted: [],
      doneItemKeys: ALL_PART1_DONE,
      expected: [],
    },
    {
      name: "doneItemKeysが空(未着手ユーザー)では何も付与されない",
      definitions: [PART1_COMPLETE, PART2_COMPLETE, PART3_COMPLETE],
      alreadyGranted: [],
      doneItemKeys: [],
      expected: [],
    },
  ];

  it.each(cases)("$name", ({ definitions, alreadyGranted, doneItemKeys, expected }) => {
    const result = evaluateNewlyEarnedBadges(
      definitions,
      new Set(alreadyGranted),
      makeContext(doneItemKeys),
    );
    expect(result).toEqual(expected);
  });
});
