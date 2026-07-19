import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultPanel } from "@/components/lab/ResultPanel";
import { getDemoExercise } from "@/lib/lab/demoExercise";
import type { RunRequest } from "@/lib/contracts/runner";

const exercise = getDemoExercise("ja");
const requestTests: RunRequest["tests"] = [
  { id: "t1", args: [5, 0, 10], expected: 5 },
  { id: "t2", args: [-5, 0, 10], expected: 0 },
];

// T-108受入基準(5)「結果パネル(テスト/コンソール タブ、diff表示)」
describe("ResultPanel", () => {
  it("shows a 'not run yet' placeholder when there is no result", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="idle"
        result={null}
        requestTests={[]}
        exercise={exercise}
        activeTab="tests"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain("まだ実行していません");
  });

  it("shows expected/actual/diff for a failed test, and nothing extra for a passing test", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="failed"
        result={{
          result: "fail",
          perTest: [
            { id: "t1", pass: true, actual: "5" },
            { id: "t2", pass: false, actual: "-1" },
          ],
          logs: [],
          durationMs: 4,
        }}
        requestTests={requestTests}
        exercise={exercise}
        activeTab="tests"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain('data-testid="lab-test-result-t1"');
    expect(html).toContain('data-testid="lab-test-result-t2"');
    expect(html).toContain('data-testid="lab-test-diff-t2"');
    expect(html).not.toContain('data-testid="lab-test-diff-t1"');
  });

  it("shows a timeout message without a perTest list", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="timeout"
        result={{ result: "timeout", logs: [], durationMs: 5000 }}
        requestTests={[]}
        exercise={exercise}
        activeTab="tests"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain("タイムアウトしました");
  });

  it("shows a runtime error message with the error text", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="runtime_error"
        result={{ result: "error", error: "禁止された構文が含まれています: eval", logs: [], durationMs: 0 }}
        requestTests={[]}
        exercise={exercise}
        activeTab="tests"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain("禁止された構文が含まれています: eval");
  });

  it("renders console log entries on the console tab", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="failed"
        result={{
          result: "fail",
          perTest: [],
          logs: [{ level: "log", args: ["hello"] }],
          durationMs: 1,
        }}
        requestTests={[]}
        exercise={exercise}
        activeTab="console"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain('data-testid="lab-console-logs"');
    expect(html).toContain("hello");
  });

  it("shows a no-logs placeholder on the console tab when there are none", () => {
    const html = renderToStaticMarkup(
      <ResultPanel
        status="idle"
        result={null}
        requestTests={[]}
        exercise={exercise}
        activeTab="console"
        onTabChange={() => {}}
        locale="ja"
      />,
    );
    expect(html).toContain("コンソール出力はありません");
  });
});
