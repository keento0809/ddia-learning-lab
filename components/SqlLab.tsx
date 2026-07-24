"use client";

import { useState } from "react";
import { runSqlExercise } from "@/lib/runner/sqlRunner";
import {
  MISMATCH_SQL,
  SETUP_SQL,
  SOLUTION_SQL,
  SYNTAX_ERROR_SQL,
  TEMPLATE_SQL,
  TESTS,
  TIMEOUT_MS,
} from "@/lib/runner/sqlExerciseFixture";
import type { SqlRunResult } from "@/lib/runner/sqlContracts";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * T-201検証用の最小デモハーネス(components/Lab.tsxと同じ位置付け)。
 * Monaco統合・スキーマビューア等の本番UIはT-202(SQL演習UI、T-108依存)のスコープ。
 */
export function SqlLab({ locale }: { locale: Locale }) {
  const t = getMessages(locale).sqlLab;
  const [sql, setSql] = useState(TEMPLATE_SQL[locale]);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<SqlRunResult | null>(null);

  async function handleRun() {
    setStatus("running");
    setResult(null);
    const runResult = await runSqlExercise({
      setupSql: SETUP_SQL,
      userSql: sql,
      tests: TESTS,
      timeoutMs: TIMEOUT_MS,
    });
    setResult(runResult);
    setStatus("idle");
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <button type="button" onClick={() => setSql(SOLUTION_SQL)}>
          {t.loadSolution}
        </button>{" "}
        <button type="button" onClick={() => setSql(MISMATCH_SQL)}>
          {t.loadMismatch}
        </button>{" "}
        <button type="button" onClick={() => setSql(SYNTAX_ERROR_SQL)}>
          {t.loadSyntaxError}
        </button>
      </div>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={4}
        style={{ width: "100%", fontFamily: "monospace" }}
        data-testid="sql-lab-code-editor"
      />

      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={handleRun} disabled={status === "running"}>
          {status === "running" ? t.running : t.run}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: "1rem" }} data-testid="sql-lab-result">
          <SqlResultSummary result={result} t={t} />
        </div>
      )}
    </div>
  );
}

function SqlResultSummary({
  result,
  t,
}: {
  result: SqlRunResult;
  t: ReturnType<typeof getMessages>["sqlLab"];
}) {
  if (result.result === "timeout") {
    return (
      <p data-testid="sql-lab-result-status">
        {`${t.resultTimeout} (${formatMessage(t.durationLabel, { ms: result.durationMs })})`}
      </p>
    );
  }

  if (result.result === "error") {
    return <p data-testid="sql-lab-result-status">{`${t.resultError}: ${result.error}`}</p>;
  }

  const passed = result.perTest.filter((test) => test.pass).length;
  return (
    <div data-testid="sql-lab-result-status">
      <p>{result.result === "pass" ? t.resultPass : t.resultFail}</p>
      <p>{formatMessage(t.testsPassed, { passed, total: result.perTest.length })}</p>
      <p>{formatMessage(t.durationLabel, { ms: result.durationMs })}</p>
      <ul>
        {result.perTest.map((test) => (
          <li key={test.id}>
            {`${test.id}: ${test.pass ? "OK" : `NG (${test.error ?? test.diff})`}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
