/**
 * Walking Skeleton (T-000) 用の暫定型定義。
 * 正式な型は T-010(コントラクト定義)で lib/contracts/ に確定させ、本ファイルは置き換える。
 */

export type TestCase = {
  id: string;
  args: unknown[];
  expected: unknown;
};

export type RunRequest = {
  code: string;
  entry: string;
  tests: TestCase[];
  timeoutMs: number;
};

export type LogEntry = {
  level: "log" | "warn" | "error";
  args: string[];
};

export type PerTestResult = {
  id: string;
  pass: boolean;
  actual?: string;
  error?: string;
};

export type RunResult =
  | {
      result: "pass" | "fail";
      perTest: PerTestResult[];
      logs: LogEntry[];
      durationMs: number;
    }
  | {
      result: "error";
      error: string;
      logs: LogEntry[];
      durationMs: number;
    }
  | {
      result: "timeout";
      logs: LogEntry[];
      durationMs: number;
    };
