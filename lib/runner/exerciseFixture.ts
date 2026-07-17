import type { TestCase } from "./types";

/**
 * Walking Skeleton (T-000) 用のダミー演習定義。
 * 本番では content/{ja,en}/**\/labs/*.yaml から読み込む(T-006)。
 * ここでは実行エンジンの貫通確認のみが目的のため、TSに直接定義する。
 */

export const ENTRY = "sum";

export const TESTS: TestCase[] = [
  { id: "t1", args: [[1, 2, 3]], expected: 6 },
  { id: "t2", args: [[]], expected: 0 },
  { id: "t3", args: [[-5, 5, 10]], expected: 10 },
];

export const TIMEOUT_MS = 3000;

export const TEMPLATE_CODE: Record<"ja" | "en", string> = {
  ja: `// numbersの合計を返す関数を実装してください\nexport function sum(numbers) {\n  // TODO: 実装\n}\n`,
  en: `// Implement a function that returns the sum of numbers\nexport function sum(numbers) {\n  // TODO: implement\n}\n`,
};

export const SOLUTION_CODE = `export function sum(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}
`;

export const INFINITE_LOOP_CODE = `export function sum(numbers) {
  while (true) {
    // 無限ループ: メインスレッド側のterminateで強制停止されることを確認する
  }
}
`;
